from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import and_, case, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, WritableUser
from app.analytics.intensity import calculate_heart_rate_zone_breakdown
from app.core.time import end_of_day, local_date, start_of_day
from app.models import Activity, ActivityStream, Gear, User
from app.schemas.activity import (
    ActivityNoteRead,
    ActivityNoteWrite,
    ActivityRead,
    ActivityUpdate,
    HeartRateZoneBreakdownRead,
    StreamRead,
)
from app.services.activity_service import attach_gear, detach_gear, get_activity_for_user, save_note
from app.services.analytics_service import recompute_owner_weekly_metrics
from app.services.gear_service import get_gear_for_user
from app.services.profile_service import get_effective_hr_zone_set, normalize_hr_zones, recompute_activity_metrics

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=list[ActivityRead])
def list_activities(
    session: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
    sport_type: str | None = None,
    workout_type: str | None = None,
    intensity_class: str | None = None,
    search: str | None = None,
    min_distance_m: float | None = None,
    max_distance_m: float | None = None,
    has_hr: bool | None = None,
    gear_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: str = "-start_time",
) -> list[ActivityRead]:
    """List owner activities with common filters."""
    statement = (
        select(Activity)
        .options(selectinload(Activity.gear), selectinload(Activity.note))
        .where(Activity.user_id == user.id)
    )
    if start_date:
        statement = statement.where(Activity.start_time_utc >= start_of_day(start_date, user.timezone))
    if end_date:
        statement = statement.where(Activity.start_time_utc <= end_of_day(end_date, user.timezone))
    if sport_type:
        statement = statement.where(Activity.sport_type == sport_type)
    if workout_type:
        statement = statement.where(Activity.workout_type == workout_type)
    if intensity_class:
        statement = statement.where(Activity.intensity_class == intensity_class)
    if search and search.strip():
        statement = statement.where(Activity.name.ilike(_like_contains_pattern(search.strip()), escape="\\"))
    if min_distance_m is not None:
        statement = statement.where(Activity.distance_m >= min_distance_m)
    if max_distance_m is not None:
        statement = statement.where(Activity.distance_m <= max_distance_m)
    if has_hr is not None:
        statement = statement.where(Activity.average_hr.is_not(None) if has_hr else Activity.average_hr.is_(None))
    if gear_id is not None:
        statement = statement.where(Activity.gear.any(Gear.id == gear_id))
    statement = statement.order_by(*_activity_sort_order(sort)).offset((page - 1) * page_size).limit(page_size)
    return [_activity_read(session, user, activity) for activity in session.scalars(statement)]


@router.get("/{activity_id}", response_model=ActivityRead)
def get_activity(activity_id: UUID, session: DbSession, user: CurrentUser) -> ActivityRead:
    """Return one owner activity."""
    activity = get_activity_for_user(session, user.id, activity_id)
    return _activity_read(session, user, activity)


@router.patch("/{activity_id}", response_model=ActivityRead)
def update_activity(activity_id: UUID, payload: ActivityUpdate, session: DbSession, user: WritableUser) -> ActivityRead:
    """Update editable activity fields."""
    activity = get_activity_for_user(session, user.id, activity_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(activity, key, value)
    recompute_activity_metrics(session, activity)
    recompute_owner_weekly_metrics(session, user.id)
    return _activity_read(session, user, activity)


@router.get("/{activity_id}/streams", response_model=list[StreamRead])
def get_streams(activity_id: UUID, session: DbSession, user: CurrentUser) -> list[StreamRead]:
    """Return streams for one activity."""
    activity = get_activity_for_user(session, user.id, activity_id)
    streams = session.scalars(select(ActivityStream).where(ActivityStream.activity_id == activity.id)).all()
    return [StreamRead.model_validate(stream) for stream in streams]


@router.get("/{activity_id}/splits")
def get_splits(activity_id: UUID, session: DbSession, user: CurrentUser) -> dict:
    """Return split data calculated from streams or activity summary."""
    activity = get_activity_for_user(session, user.id, activity_id)
    streams = list(session.scalars(select(ActivityStream).where(ActivityStream.activity_id == activity.id)))
    return build_activity_splits(activity, streams)


@router.put("/{activity_id}/notes", response_model=ActivityNoteRead)
def put_notes(activity_id: UUID, payload: ActivityNoteWrite, session: DbSession, user: WritableUser) -> ActivityNoteRead:
    """Create or update activity notes."""
    activity = get_activity_for_user(session, user.id, activity_id)
    note = save_note(session, activity, payload.model_dump(exclude_unset=True))
    recompute_owner_weekly_metrics(session, user.id)
    return ActivityNoteRead.model_validate(note)


@router.post("/{activity_id}/gear/{gear_id}", response_model=ActivityRead)
def add_activity_gear(activity_id: UUID, gear_id: UUID, session: DbSession, user: WritableUser) -> ActivityRead:
    """Assign gear to an activity."""
    activity = get_activity_for_user(session, user.id, activity_id)
    gear = get_gear_for_user(session, user.id, gear_id)
    return _activity_read(session, user, attach_gear(session, activity, gear))


@router.delete("/{activity_id}/gear/{gear_id}", status_code=204)
def remove_activity_gear(activity_id: UUID, gear_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Remove gear from an activity."""
    activity = get_activity_for_user(session, user.id, activity_id)
    gear = get_gear_for_user(session, user.id, gear_id)
    detach_gear(session, activity, gear)
    return Response(status_code=204)


def _activity_read(session: DbSession, user: User, activity: Activity) -> ActivityRead:
    """Return an activity response with derived display metrics."""
    return ActivityRead.model_validate(activity).model_copy(
        update={"heart_rate_zone_breakdown": _heart_rate_zone_breakdown(session, user, activity)}
    )


def _heart_rate_zone_breakdown(
    session: DbSession,
    user: User,
    activity: Activity,
) -> list[HeartRateZoneBreakdownRead]:
    """Return the activity heart-rate zone breakdown."""
    hr_values = _heartrate_values(session, activity) or _average_hr_values(activity)
    activity_date = local_date(activity.start_time_utc, user.timezone)
    zone_set = get_effective_hr_zone_set(session, user.id, activity_date)
    if zone_set is None:
        return []
    hr_zones = normalize_hr_zones(zone_set.zones)
    zone_names = [str(zone.get("name") or f"Z{index + 1}") for index, zone in enumerate(zone_set.zones)]
    return [
        HeartRateZoneBreakdownRead(
            zone_index=item.zone_index,
            name=item.name,
            min_hr=item.min_hr,
            max_hr=item.max_hr,
            seconds=item.seconds,
            sample_count=item.sample_count,
            percentage=item.percentage,
        )
        for item in calculate_heart_rate_zone_breakdown(activity.moving_time_s, hr_values, hr_zones, zone_names)
    ]


def _heartrate_values(session: DbSession, activity: Activity) -> list[int | float] | None:
    """Return numeric heart-rate stream values for an activity."""
    stream = session.scalar(
        select(ActivityStream).where(
            ActivityStream.activity_id == activity.id,
            ActivityStream.stream_type == "heartrate",
        )
    )
    if stream is None or not isinstance(stream.data, list):
        return None
    values = [value for value in stream.data if isinstance(value, int | float) and not isinstance(value, bool)]
    return values or None


def _average_hr_values(activity: Activity) -> list[float] | None:
    """Return average heart rate as a single sample."""
    if activity.average_hr is None:
        return None
    return [float(activity.average_hr)]


def _like_contains_pattern(value: str) -> str:
    """Return an escaped SQL LIKE contains pattern."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _activity_sort_order(sort: str) -> list:
    """Return SQLAlchemy order clauses for an activity list sort key."""
    descending = sort.startswith("-")
    sort_key = sort[1:] if descending else sort
    expression = _activity_sort_expression(sort_key)
    if expression is None:
        descending = True
        expression = Activity.start_time_utc
    sorted_expression = expression.desc() if descending else expression.asc()
    return [expression.is_(None).asc(), sorted_expression, Activity.start_time_utc.desc(), Activity.id.asc()]


def _activity_sort_expression(sort_key: str):
    """Return the SQL expression used by an activity sort key."""
    sort_fields = {
        "start_time": Activity.start_time_utc,
        "date": Activity.start_time_utc,
        "distance": Activity.distance_m,
        "moving_time": Activity.moving_time_s,
        "time": Activity.moving_time_s,
        "average_hr": Activity.average_hr,
        "avg_hr": Activity.average_hr,
        "computed_load": Activity.computed_load,
        "load": Activity.computed_load,
        "elevation_gain": Activity.elevation_gain_m,
    }
    if sort_key == "pace":
        return case(
            (
                and_(
                    Activity.distance_m.is_not(None),
                    Activity.distance_m > 0,
                    Activity.moving_time_s.is_not(None),
                ),
                Activity.moving_time_s / (Activity.distance_m / 1000.0),
            ),
            else_=None,
        )
    return sort_fields.get(sort_key)


def build_activity_splits(activity: Activity, streams: list[ActivityStream]) -> dict:
    """Build split response data for one activity."""
    by_type = {stream.stream_type: _numeric_values(stream.data) for stream in streams}
    distance = by_type.get("distance") or []
    time = by_type.get("time") or []
    if len(distance) >= 2 and len(time) >= 2:
        splits = _stream_splits(
            distance=distance,
            time=time,
            heartrate=by_type.get("heartrate") or [],
            altitude=by_type.get("elevation_corrected") or by_type.get("altitude") or [],
        )
        if splits:
            return {"source": "streams", "splits": splits}
    return {"source": "activity_summary", "splits": [_summary_split(activity)]}


def _stream_splits(
    distance: list[float],
    time: list[float],
    heartrate: list[float],
    altitude: list[float],
) -> list[dict]:
    """Calculate kilometer-style splits from aligned stream arrays."""
    splits: list[dict] = []
    current_distance = 0.0
    current_duration = 0.0
    current_hr: list[float] = []
    total_distance = 0.0
    split_start_distance = 0.0
    altitude_profile = _altitude_profile(distance, altitude)
    split_index = 1
    sample_count = min(len(distance), len(time))
    for index in range(1, sample_count):
        delta_distance = max(0.0, distance[index] - distance[index - 1])
        delta_duration = max(0.0, time[index] - time[index - 1])
        if delta_distance <= 0 and delta_duration <= 0:
            continue
        current_distance += delta_distance
        total_distance += delta_distance
        current_duration += delta_duration
        current_hr.extend(_segment_hr_values(heartrate, index))
        if current_distance >= 1000 or index == sample_count - 1:
            current_gain = _elevation_gain_between(altitude_profile, split_start_distance, total_distance)
            splits.append(
                _split_dict(
                    split_index,
                    current_distance,
                    current_duration,
                    _average(current_hr),
                    current_gain,
                )
            )
            split_index += 1
            current_distance = 0.0
            current_duration = 0.0
            current_hr = []
            split_start_distance = total_distance
    return splits


def _summary_split(activity: Activity) -> dict:
    """Return one whole-activity split when streams are unavailable."""
    distance = float(activity.distance_m or 0)
    duration = float(activity.moving_time_s or activity.elapsed_time_s or 0)
    average_hr = float(activity.average_hr) if activity.average_hr is not None else None
    gain = float(activity.elevation_gain_m or 0)
    return _split_dict(1, distance, duration, average_hr, gain)


def _split_dict(
    split_index: int,
    distance_m: float,
    duration_s: float,
    average_hr: float | None,
    elevation_gain_m: float,
) -> dict:
    """Format one split for API output."""
    pace = duration_s / (distance_m / 1000) if distance_m > 0 else None
    return {
        "split_index": split_index,
        "distance_m": round(distance_m, 2),
        "duration_s": int(round(duration_s)),
        "pace_s_per_km": round(pace, 2) if pace is not None else None,
        "average_hr": round(average_hr, 1) if average_hr is not None else None,
        "elevation_gain_m": round(elevation_gain_m, 2),
    }


def _numeric_values(data: list | dict) -> list[float]:
    """Return numeric values from stream data."""
    if not isinstance(data, list):
        return []
    return [float(value) for value in data if isinstance(value, int | float) and not isinstance(value, bool)]


def _segment_hr_values(heartrate: list[float], index: int) -> list[float]:
    """Return HR samples for one stream segment."""
    values: list[float] = []
    if index - 1 < len(heartrate):
        values.append(heartrate[index - 1])
    if index < len(heartrate):
        values.append(heartrate[index])
    return values


def _average(values: list[float]) -> float | None:
    """Return the arithmetic mean for values."""
    return sum(values) / len(values) if values else None


def _altitude_profile(distance: list[float], altitude: list[float]) -> list[tuple[float, float]]:
    """Return elevation samples positioned on the activity distance axis."""
    if len(altitude) < 2:
        return []
    total_distance = _total_positive_distance(distance)
    if total_distance <= 0:
        return []
    if len(altitude) == len(distance):
        cumulative_distance = 0.0
        points = [(0.0, altitude[0])]
        for index in range(1, len(altitude)):
            cumulative_distance += max(0.0, distance[index] - distance[index - 1])
            points.append((cumulative_distance, altitude[index]))
        return _dedupe_profile(points)
    step_distance = total_distance / (len(altitude) - 1)
    return [(index * step_distance, value) for index, value in enumerate(altitude)]


def _total_positive_distance(distance: list[float]) -> float:
    """Return the total forward distance from a distance stream."""
    total = 0.0
    for index in range(1, len(distance)):
        total += max(0.0, distance[index] - distance[index - 1])
    return total


def _dedupe_profile(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Return profile points with duplicate distances collapsed."""
    profile: list[tuple[float, float]] = []
    for point_distance, elevation in points:
        if profile and point_distance == profile[-1][0]:
            profile[-1] = (point_distance, elevation)
        else:
            profile.append((point_distance, elevation))
    return profile


def _elevation_gain_between(profile: list[tuple[float, float]], start_m: float, end_m: float) -> float:
    """Return positive elevation gain inside one distance interval."""
    if len(profile) < 2 or end_m <= start_m:
        return 0.0
    clipped = [(start_m, _interpolated_elevation(profile, start_m))]
    clipped.extend((point_distance, elevation) for point_distance, elevation in profile if start_m < point_distance < end_m)
    clipped.append((end_m, _interpolated_elevation(profile, end_m)))
    gain = 0.0
    for index in range(1, len(clipped)):
        gain += max(0.0, clipped[index][1] - clipped[index - 1][1])
    return gain


def _interpolated_elevation(profile: list[tuple[float, float]], target_m: float) -> float:
    """Return interpolated elevation at a distance on the profile."""
    if target_m <= profile[0][0]:
        return profile[0][1]
    if target_m >= profile[-1][0]:
        return profile[-1][1]
    for index in range(1, len(profile)):
        left_distance, left_elevation = profile[index - 1]
        right_distance, right_elevation = profile[index]
        if target_m > right_distance:
            continue
        if right_distance <= left_distance:
            return right_elevation
        ratio = (target_m - left_distance) / (right_distance - left_distance)
        return left_elevation + (right_elevation - left_elevation) * ratio
    return profile[-1][1]
