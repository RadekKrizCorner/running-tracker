from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.analytics.intensity import classify_intensity
from app.analytics.load import calculate_training_load
from app.core.exceptions import AppException
from app.core.time import local_date
from app.models import Activity, ActivityStream, HeartRateZoneSet, User, UserPreference
from app.schemas.profile import HeartRateZoneSetCreate, UserPreferenceUpdate
from app.services.analytics_service import recompute_owner_weekly_metrics


def create_hr_zone_set(session: Session, user: User, payload: HeartRateZoneSetCreate) -> HeartRateZoneSet:
    """Create or replace one dated HR zone set."""
    existing = session.scalar(
        select(HeartRateZoneSet).where(
            HeartRateZoneSet.user_id == user.id,
            HeartRateZoneSet.effective_from == payload.effective_from,
        )
    )
    zones = [zone.model_dump() for zone in payload.zones]
    if existing is None:
        existing = HeartRateZoneSet(
            user_id=user.id,
            name=payload.name,
            effective_from=payload.effective_from,
            zones=zones,
        )
        session.add(existing)
    else:
        existing.name = payload.name
        existing.zones = zones
    session.commit()
    session.refresh(existing)
    recompute_user_hr_stream_metrics(session, user.id)
    return existing


def get_or_create_user_preferences(session: Session, user: User) -> UserPreference:
    """Return owner preferences, creating defaults when missing."""
    preferences = session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if preferences is not None:
        return preferences
    preferences = UserPreference(
        user_id=user.id,
        locale="cs-CZ",
        dashboard_mode="advanced",
        favorite_template_ids=[],
        recent_template_ids=[],
        pace_zones=[],
        elevation_correction_enabled=False,
        elevation_correction_mode="only_when_zero",
        elevation_provider_url=None,
        avatar_icon=None,
        avatar_image_data_url=None,
        route_start_lat=None,
        route_start_lng=None,
        route_start_label=None,
    )
    session.add(preferences)
    session.commit()
    session.refresh(preferences)
    return preferences


def update_user_preferences(session: Session, user: User, payload: UserPreferenceUpdate) -> UserPreference:
    """Update owner UI preferences."""
    preferences = get_or_create_user_preferences(session, user)
    updates = payload.model_dump(exclude_unset=True)
    if "pace_zones" in updates and updates["pace_zones"] is not None:
        updates["pace_zones"] = [zone.model_dump() if hasattr(zone, "model_dump") else zone for zone in payload.pace_zones or []]
    nullable_preference_fields = {
        "elevation_provider_url",
        "avatar_icon",
        "avatar_image_data_url",
        "route_start_lat",
        "route_start_lng",
        "route_start_label",
    }
    for key, value in updates.items():
        if value is not None or key in nullable_preference_fields:
            setattr(preferences, key, value)
    session.commit()
    session.refresh(preferences)
    return preferences


def list_hr_zone_sets(session: Session, user_id: UUID) -> list[HeartRateZoneSet]:
    """Return owner HR zone sets newest first."""
    return list(
        session.scalars(
            select(HeartRateZoneSet)
            .where(HeartRateZoneSet.user_id == user_id)
            .order_by(HeartRateZoneSet.effective_from.desc())
        )
    )


def recompute_user_hr_metrics(session: Session, user_id: UUID) -> dict[str, int | date | None]:
    """Recompute HR-based metrics after zones have been configured."""
    if not list_hr_zone_sets(session, user_id):
        raise AppException(409, "HR_ZONES_REQUIRED", "Add heart-rate zones before recalculating intensity")
    recomputed_activities = recompute_user_hr_stream_metrics(session, user_id)
    missing_zone_count, earliest_missing_zone_date = summarize_hr_activities_without_effective_zones(session, user_id)
    return {
        "recomputed_activities": recomputed_activities,
        "remaining_unknown_activities": count_unknown_hr_activities(session, user_id),
        "activities_without_effective_zones": missing_zone_count,
        "earliest_activity_without_effective_zones": earliest_missing_zone_date,
    }


def get_effective_hr_zone_set(session: Session, user_id: UUID, activity_date: date) -> HeartRateZoneSet | None:
    """Return the HR zone set effective for an activity date."""
    return session.scalar(
        select(HeartRateZoneSet)
        .where(
            HeartRateZoneSet.user_id == user_id,
            HeartRateZoneSet.effective_from <= activity_date,
        )
        .order_by(HeartRateZoneSet.effective_from.desc())
        .limit(1)
    )


def get_effective_hr_zones(session: Session, user_id: UUID, activity_date: date) -> list[tuple[int, int]] | None:
    """Return effective HR zone boundaries for an activity date."""
    zone_set = get_effective_hr_zone_set(session, user_id, activity_date)
    if zone_set is None:
        return None
    return normalize_hr_zones(zone_set.zones)


def normalize_hr_zones(zones: list[dict]) -> list[tuple[int, int]]:
    """Convert stored HR zone JSON into tuple boundaries."""
    if len(zones) != 5:
        raise AppException(500, "HR_ZONES_INVALID", "Stored heart-rate zones are invalid")
    return [(int(zone["min_hr"]), int(zone["max_hr"])) for zone in zones]


def recompute_user_hr_stream_metrics(session: Session, user_id: UUID) -> int:
    """Recompute metrics for owner activities that have heart-rate data."""
    activities = list(session.scalars(_hr_activity_statement(user_id)))
    for activity in activities:
        recompute_activity_metrics(session, activity)
    if activities:
        recompute_owner_weekly_metrics(session, user_id)
    return len(activities)


def count_unknown_hr_activities(session: Session, user_id: UUID) -> int:
    """Count owner HR activities that remain unclassified."""
    return len(
        list(
            session.scalars(
                select(Activity.id)
                .where(
                    Activity.user_id == user_id,
                    Activity.intensity_class == "unknown",
                    _hr_activity_filter(),
                )
            )
        )
    )


def summarize_hr_activities_without_effective_zones(session: Session, user_id: UUID) -> tuple[int, date | None]:
    """Return count and earliest date for unknown HR activities without effective zones."""
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    missing_dates: list[date] = []
    for activity in session.scalars(_hr_activity_statement(user_id)):
        if activity.intensity_class != "unknown":
            continue
        started_at = _as_utc_datetime(activity.start_time_utc) or activity.start_time_utc
        activity_date = local_date(started_at, timezone)
        if get_effective_hr_zone_set(session, user_id, activity_date) is None:
            missing_dates.append(activity_date)
    return len(missing_dates), min(missing_dates) if missing_dates else None


def recompute_activity_metrics(session: Session, activity: Activity) -> Activity:
    """Recompute stored load and intensity for one activity."""
    user = session.get(User, activity.user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    started_at = _as_utc_datetime(activity.start_time_utc) or activity.start_time_utc
    activity_date = local_date(started_at, timezone)
    hr_stream = _heartrate_stream_for_activity(session, activity)
    hr_values = hr_stream or _average_hr_values_for_activity(activity)
    hr_zones = get_effective_hr_zones(session, activity.user_id, activity_date)
    rpe = float(activity.perceived_effort) if activity.perceived_effort is not None else None
    load_result = calculate_training_load(activity.moving_time_s, hr_values, hr_zones, rpe)
    activity.computed_load = Decimal(str(load_result.load))
    activity.load_source = load_result.source
    activity.intensity_class = classify_intensity(
        activity.moving_time_s,
        hr_values,
        hr_zones,
        rpe,
        activity.workout_type,
    )
    session.commit()
    session.refresh(activity)
    return activity


def _heartrate_stream_for_activity(session: Session, activity: Activity) -> list[int | float] | None:
    """Return numeric heartrate stream data for an activity."""
    stream = session.scalar(
        select(ActivityStream).where(
            ActivityStream.activity_id == activity.id,
            ActivityStream.stream_type == "heartrate",
        )
    )
    if stream is None or not isinstance(stream.data, list):
        return None
    values = [value for value in stream.data if isinstance(value, int | float)]
    return values or None


def _hr_activity_statement(user_id: UUID):
    """Build a query for owner activities that have heart-rate data."""
    return select(Activity).where(Activity.user_id == user_id, _hr_activity_filter())


def _hr_activity_filter():
    """Build the shared SQL filter for activities with heart-rate data."""
    heartrate_activity_ids = select(ActivityStream.activity_id).where(ActivityStream.stream_type == "heartrate")
    return or_(Activity.id.in_(heartrate_activity_ids), Activity.average_hr.is_not(None))


def _average_hr_values_for_activity(activity: Activity) -> list[float] | None:
    """Return average heart rate as a one-sample stream."""
    if activity.average_hr is None:
        return None
    return [float(activity.average_hr)]


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    """Return a datetime normalized to UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
