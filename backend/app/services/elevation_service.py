from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from app.analytics.elevation import calculate_positive_elevation_gain
from app.core.exceptions import AppException
from app.models import Activity, ActivityStream, User, UserPreference
from app.providers.elevation.client import ElevationClient
from app.services.analytics_service import recompute_owner_weekly_metrics
from app.services.profile_service import get_or_create_user_preferences

CORRECTED_ELEVATION_STREAM = "elevation_corrected"
MAX_ELEVATION_POINTS_PER_ACTIVITY = 100


def recompute_user_elevation_metrics(session: Session, user: User) -> dict[str, int]:
    """Recompute GPS-based elevation for owner activities."""
    preferences = get_or_create_user_preferences(session, user)
    _ensure_elevation_correction_ready(preferences)
    recomputed = 0
    skipped = 0
    failed = 0
    activities = list(session.scalars(_gps_activity_statement(user.id, preferences)))
    for activity in activities:
        result = apply_elevation_correction(session, activity, preferences)
        if result == "recomputed":
            recomputed += 1
        elif result == "failed":
            failed += 1
        else:
            skipped += 1
    if recomputed:
        recompute_owner_weekly_metrics(session, user.id)
    return {
        "recomputed_activities": recomputed,
        "skipped_activities": skipped,
        "failed_activities": failed,
    }


def apply_elevation_correction_if_enabled(session: Session, activity: Activity) -> str:
    """Apply elevation correction for one activity when owner preferences allow it."""
    user = session.get(User, activity.user_id)
    if user is None:
        return "skipped"
    preferences = get_or_create_user_preferences(session, user)
    if not preferences.elevation_correction_enabled:
        return "skipped"
    if not _provider_url(preferences):
        return "skipped"
    return apply_elevation_correction(session, activity, preferences)


def apply_elevation_correction(session: Session, activity: Activity, preferences: UserPreference) -> str:
    """Apply GPS-based elevation correction for one activity."""
    if not _should_correct_activity(activity, preferences):
        return "skipped"
    points = _latlng_points_for_activity(session, activity)
    if len(points) < 2:
        return "skipped"
    sampled_points = _sample_points(points, MAX_ELEVATION_POINTS_PER_ACTIVITY)
    provider_url = _provider_url(preferences)
    if provider_url is None:
        return "skipped"
    try:
        elevations = ElevationClient(provider_url).lookup_elevations(sampled_points)
    except AppException:
        return "failed"
    if len(elevations) != len(sampled_points):
        return "failed"
    gain = calculate_positive_elevation_gain(elevations)
    activity.elevation_gain_m = Decimal(str(round(gain, 2)))
    activity.elevation_gain_source = "dem_corrected"
    _upsert_corrected_elevation_stream(session, activity, elevations)
    session.commit()
    session.refresh(activity)
    return "recomputed"


def _ensure_elevation_correction_ready(preferences: UserPreference) -> None:
    """Raise a clear error when elevation correction is not configured."""
    if not preferences.elevation_correction_enabled:
        raise AppException(409, "ELEVATION_CORRECTION_DISABLED", "Enable elevation correction before recalculating")
    if not _provider_url(preferences):
        raise AppException(409, "ELEVATION_PROVIDER_REQUIRED", "Set an elevation provider URL before recalculating")


def _gps_activity_statement(user_id: UUID, preferences: UserPreference):
    """Build a query for owner activities with GPS streams."""
    gps_activity_ids = select(ActivityStream.activity_id).where(ActivityStream.stream_type == "latlng")
    zero_or_missing_gain = or_(Activity.elevation_gain_m.is_(None), Activity.elevation_gain_m <= 0)
    statement = select(Activity).where(Activity.user_id == user_id, Activity.id.in_(gps_activity_ids))
    if preferences.elevation_correction_mode != "always":
        statement = statement.where(zero_or_missing_gain)
    return statement.order_by(
        case((zero_or_missing_gain, 0), else_=1),
        Activity.start_time_utc.desc(),
    )


def _should_correct_activity(activity: Activity, preferences: UserPreference) -> bool:
    """Return whether one activity should get DEM elevation correction."""
    if preferences.elevation_correction_mode == "always":
        return True
    current_gain = float(activity.elevation_gain_m or 0)
    return current_gain <= 0


def _latlng_points_for_activity(session: Session, activity: Activity) -> list[tuple[float, float]]:
    """Return valid latitude and longitude points for an activity."""
    stream = session.scalar(
        select(ActivityStream).where(
            ActivityStream.activity_id == activity.id,
            ActivityStream.stream_type == "latlng",
        )
    )
    if stream is None or not isinstance(stream.data, list):
        return []
    points: list[tuple[float, float]] = []
    for point in stream.data:
        if not _valid_latlng(point):
            continue
        points.append((float(point[0]), float(point[1])))
    return points


def _sample_points(points: list[tuple[float, float]], max_points: int) -> list[tuple[float, float]]:
    """Return an evenly sampled coordinate list with first and last points preserved."""
    if len(points) <= max_points:
        return points
    if max_points < 2:
        return points[:max_points]
    last_index = len(points) - 1
    indexes = {round(index * last_index / (max_points - 1)) for index in range(max_points)}
    return [points[index] for index in sorted(indexes)]


def _valid_latlng(point: object) -> bool:
    """Return whether an object looks like a latitude and longitude pair."""
    if not isinstance(point, list | tuple) or len(point) != 2:
        return False
    lat, lng = point
    return _valid_coordinate(lat, -90, 90) and _valid_coordinate(lng, -180, 180)


def _valid_coordinate(value: object, minimum: float, maximum: float) -> bool:
    """Return whether a coordinate value is numeric and inside bounds."""
    if not isinstance(value, int | float) or isinstance(value, bool):
        return False
    return minimum <= float(value) <= maximum


def _upsert_corrected_elevation_stream(session: Session, activity: Activity, elevations: list[float]) -> ActivityStream:
    """Create or update the corrected elevation stream for an activity."""
    stream = session.scalar(
        select(ActivityStream).where(
            ActivityStream.activity_id == activity.id,
            ActivityStream.stream_type == CORRECTED_ELEVATION_STREAM,
        )
    )
    if stream is None:
        stream = ActivityStream(
            activity_id=activity.id,
            stream_type=CORRECTED_ELEVATION_STREAM,
            data=elevations,
            sample_count=len(elevations),
        )
        session.add(stream)
        return stream
    stream.data = elevations
    stream.sample_count = len(elevations)
    return stream


def _provider_url(preferences: UserPreference) -> str | None:
    """Return a configured elevation provider URL."""
    if preferences.elevation_provider_url is None:
        return None
    cleaned = preferences.elevation_provider_url.strip()
    return cleaned or None
