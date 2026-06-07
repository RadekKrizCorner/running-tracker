from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.analytics.intensity import HeartRateZoneBreakdownItem, calculate_heart_rate_zone_breakdown
from app.core.time import local_date, start_of_day, utc_now, week_start
from app.models import (
    Activity,
    ActivityStream,
    HeartRateZoneSet,
    PlannedWorkout,
    User,
    WeeklyMetric,
)
from app.services.planning_service import deduplicate_planned_workouts_by_session

RUNNING_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill", "TreadmillRun"}


def recompute_owner_weekly_metrics(session: Session, user_id: UUID) -> list[WeeklyMetric]:
    """Recompute all weekly metrics for an owner."""
    user = _lock_owner_for_weekly_recompute(session, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    activities = list(
        session.scalars(
            select(Activity)
            .where(Activity.user_id == user_id, Activity.sport_type.in_(RUNNING_TYPES))
            .order_by(Activity.start_time_utc)
        )
    )
    session.execute(delete(WeeklyMetric).where(WeeklyMetric.user_id == user_id))
    session.flush()
    grouped: dict[date, list[Activity]] = {}
    for activity in activities:
        grouped.setdefault(week_start(local_date(activity.start_time_utc, timezone)), []).append(activity)
    metrics: list[WeeklyMetric] = []
    for start in sorted(grouped):
        week_activities = grouped[start]
        week_end = start_of_day(start + timedelta(days=7), timezone)
        acute_start = week_end - timedelta(days=7)
        chronic_start = week_end - timedelta(days=28)
        acute_load = _sum_load_between(activities, acute_start, week_end)
        chronic_load = _sum_load_between(activities, chronic_start, week_end)
        easy_time_s, moderate_time_s, hard_time_s = _weekly_intensity_seconds(
            session,
            user_id,
            timezone,
            week_activities,
        )
        metric = WeeklyMetric(
            user_id=user_id,
            week_start_date=start,
            distance_m=_sum_decimal(activity.distance_m for activity in week_activities),
            moving_time_s=sum(activity.moving_time_s or 0 for activity in week_activities),
            elevation_gain_m=_sum_decimal(activity.elevation_gain_m for activity in week_activities),
            run_count=len(week_activities),
            load=_sum_decimal(activity.computed_load for activity in week_activities),
            acute_load=Decimal(str(round(acute_load, 2))),
            chronic_load=Decimal(str(round(chronic_load, 2))),
            ramp_ratio=Decimal(str(round(acute_load / chronic_load, 3))) if chronic_load > 0 else None,
            easy_time_s=easy_time_s,
            moderate_time_s=moderate_time_s,
            hard_time_s=hard_time_s,
            long_run_distance_m=max((activity.distance_m or Decimal("0") for activity in week_activities), default=Decimal("0")),
        )
        session.add(metric)
        metrics.append(metric)
    session.commit()
    return metrics


def ensure_owner_weekly_metrics_current(session: Session, user_id: UUID) -> None:
    """Recompute owner weekly metrics only when stored aggregates are stale."""
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    if not _owner_weekly_metrics_are_current(session, user_id, timezone):
        recompute_owner_weekly_metrics(session, user_id)


def _owner_weekly_metrics_are_current(session: Session, user_id: UUID, timezone: str) -> bool:
    """Return whether stored weekly metrics match the owner's activity set."""
    activity_starts = list(
        session.scalars(
            select(Activity.start_time_utc)
            .where(Activity.user_id == user_id, Activity.sport_type.in_(RUNNING_TYPES))
            .order_by(Activity.start_time_utc)
        )
    )
    metric_week_starts = set(
        session.scalars(select(WeeklyMetric.week_start_date).where(WeeklyMetric.user_id == user_id))
    )
    if not activity_starts:
        return not metric_week_starts
    activity_week_starts = {week_start(local_date(started_at, timezone)) for started_at in activity_starts}
    if activity_week_starts != metric_week_starts:
        return False

    latest_activity_update = session.scalar(
        select(func.max(Activity.updated_at)).where(Activity.user_id == user_id, Activity.sport_type.in_(RUNNING_TYPES))
    )
    latest_metric_update = session.scalar(
        select(func.max(WeeklyMetric.updated_at)).where(WeeklyMetric.user_id == user_id)
    )
    if latest_activity_update is None or latest_metric_update is None:
        return False
    return _utc_datetime(latest_activity_update) <= _utc_datetime(latest_metric_update)


def _lock_owner_for_weekly_recompute(session: Session, user_id: UUID) -> User | None:
    """Lock one owner row while weekly metrics are replaced."""
    return session.scalar(select(User).where(User.id == user_id).with_for_update())


def dashboard_payload(session: Session, user_id: UUID, period: str, selected_week_start_date: date | None = None) -> dict:
    """Build dashboard analytics payload."""
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    current_local_date = local_date(utc_now(), timezone)
    current_week_start = week_start(current_local_date)
    plan_week_start = week_start(selected_week_start_date) if selected_week_start_date is not None else current_week_start
    plan_week_end = plan_week_start + timedelta(days=6)
    weeks = recent_weekly_metrics(session, user_id, weeks=12)
    weeks_by_start = {date.fromisoformat(metric["week_start_date"]): metric for metric in weeks}
    current = weeks_by_start.get(current_week_start)
    previous = weeks_by_start.get(current_week_start - timedelta(days=7))
    recent = list(
        session.scalars(
            select(Activity).where(Activity.user_id == user_id).order_by(Activity.start_time_utc.desc()).limit(8)
        )
    )
    upcoming = list(
        session.scalars(
            select(PlannedWorkout)
            .where(PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date >= current_local_date)
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
            .limit(8)
        )
    )
    current_distance = float(current["distance_m"]) if current else 0
    previous_distance = float(previous["distance_m"]) if previous else 0
    return {
        "period": period,
        "this_week": {
            "distance_m": current_distance,
            "moving_time_s": current["moving_time_s"] if current else 0,
            "run_count": current["run_count"] if current else 0,
            "load": float(current["load"]) if current else 0,
            "longest_run_m": float(current["long_run_distance_m"]) if current else 0,
            "elevation_gain_m": float(current["elevation_gain_m"]) if current else 0,
        },
        "trends": {
            "week_distance_delta_m": current_distance - previous_distance,
            "ramp_ratio": float(current["ramp_ratio"]) if current and current["ramp_ratio"] is not None else None,
            "acute_load": float(current["acute_load"]) if current else 0,
            "chronic_load": float(current["chronic_load"]) if current else 0,
        },
        "intensity_split": {
            "easy_time_s": current["easy_time_s"] if current else 0,
            "moderate_time_s": current["moderate_time_s"] if current else 0,
            "hard_time_s": current["hard_time_s"] if current else 0,
            "unknown_time_s": current["unknown_time_s"] if current else 0,
        },
        "weekly": weeks,
        "recent_activities": [_activity_summary(activity) for activity in recent],
        "upcoming_workouts": [_workout_summary(workout) for workout in upcoming],
        "week_plan": _week_plan_comparison(
            session,
            user_id,
            timezone,
            current_local_date,
            plan_week_start,
            plan_week_end,
        ),
    }


def weekly_metrics_between(
    session: Session,
    user_id: UUID,
    start_date: date | None,
    end_date: date | None,
) -> list[WeeklyMetric]:
    """Return weekly metrics in a date range."""
    ensure_owner_weekly_metrics_current(session, user_id)
    statement = select(WeeklyMetric).where(WeeklyMetric.user_id == user_id).order_by(WeeklyMetric.week_start_date)
    if start_date is not None:
        statement = statement.where(WeeklyMetric.week_start_date >= start_date)
    if end_date is not None:
        statement = statement.where(WeeklyMetric.week_start_date <= end_date)
    return list(session.scalars(statement))


def recent_weekly_metrics(session: Session, user_id: UUID, weeks: int = 12) -> list[dict]:
    """Return dense recent weekly metrics ending at the current owner-local week."""
    ensure_owner_weekly_metrics_current(session, user_id)
    safe_weeks = max(1, min(weeks, 52))
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    current_week_start = week_start(local_date(utc_now(), timezone))
    first_week_start = current_week_start - timedelta(days=(safe_weeks - 1) * 7)
    stored_metrics = list(
        session.scalars(
            select(WeeklyMetric)
            .where(
                WeeklyMetric.user_id == user_id,
                WeeklyMetric.week_start_date >= first_week_start,
                WeeklyMetric.week_start_date <= current_week_start,
            )
            .order_by(WeeklyMetric.week_start_date)
        )
    )
    metrics_by_start = {metric.week_start_date: metric for metric in stored_metrics}
    return [
        _weekly_dict(metrics_by_start[start]) if start in metrics_by_start else _empty_weekly_dict(start)
        for start in _week_starts(first_week_start, safe_weeks)
    ]


def yearly_running_summary(session: Session, user_id: UUID, year: int) -> dict:
    """Return running totals for one owner-local calendar year."""
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    start = start_of_day(date(year, 1, 1), timezone)
    end = start_of_day(date(year + 1, 1, 1), timezone)
    distance_m, elevation_gain_m, moving_time_s = session.execute(
        select(
            func.coalesce(func.sum(Activity.distance_m), 0),
            func.coalesce(func.sum(Activity.elevation_gain_m), 0),
            func.coalesce(func.sum(Activity.moving_time_s), 0),
        ).where(
            Activity.user_id == user_id,
            Activity.sport_type.in_(RUNNING_TYPES),
            Activity.start_time_utc >= start,
            Activity.start_time_utc < end,
        )
    ).one()
    return {
        "year": year,
        "distance_m": float(distance_m or 0),
        "elevation_gain_m": float(elevation_gain_m or 0),
        "moving_time_s": int(moving_time_s or 0),
    }


def aerobic_trend(session: Session, user_id: UUID) -> list[dict]:
    """Return simple easy-run efficiency trend points."""
    activities = list(
        session.scalars(
            select(Activity)
            .where(Activity.user_id == user_id, Activity.intensity_class == "easy", Activity.moving_time_s >= 1200)
            .order_by(Activity.start_time_utc)
        )
    )
    points = []
    for activity in activities:
        distance_km = float(activity.distance_m or 0) / 1000
        if distance_km <= 0:
            continue
        points.append(
            {
                "date": activity.start_time_utc.date().isoformat(),
                "pace_s_per_km": (activity.moving_time_s or 0) / distance_km,
                "average_hr": float(activity.average_hr) if activity.average_hr is not None else None,
                "elevation_gain_per_km": float(activity.elevation_gain_m or 0) / distance_km,
            }
        )
    return points


def prs(session: Session, user_id: UUID) -> dict:
    """Return simple whole-activity personal records."""
    activities = list(session.scalars(select(Activity).where(Activity.user_id == user_id)))
    records: dict[str, dict | None] = {"half_marathon": None, "marathon": None, "five_k_activity": None, "ten_k_activity": None}
    thresholds = {"five_k_activity": 5000, "ten_k_activity": 10000, "half_marathon": 21097.5, "marathon": 42195}
    for name, threshold in thresholds.items():
        candidates = [activity for activity in activities if float(activity.distance_m or 0) >= threshold and activity.moving_time_s]
        best = min(candidates, key=lambda item: item.moving_time_s) if candidates else None
        records[name] = _activity_summary(best) if best else None
    return records


def run_heatmap(
    session: Session,
    user_id: UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    precision: int = 3,
    limit: int = 2000,
) -> dict:
    """Return aggregated GPS route density for owner running activities."""
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    safe_precision = max(1, min(precision, 5))
    safe_limit = max(1, min(limit, 10000))
    statement = (
        select(Activity.id, ActivityStream.data)
        .join(ActivityStream, ActivityStream.activity_id == Activity.id)
        .where(
            Activity.user_id == user_id,
            Activity.sport_type.in_(RUNNING_TYPES),
            ActivityStream.stream_type == "latlng",
        )
        .order_by(Activity.start_time_utc)
    )
    if start_date is not None:
        statement = statement.where(Activity.start_time_utc >= start_of_day(start_date, timezone))
    if end_date is not None:
        statement = statement.where(Activity.start_time_utc < start_of_day(end_date + timedelta(days=1), timezone))

    cells: dict[tuple[float, float], dict] = {}
    activity_ids: set[UUID] = set()
    point_count = 0
    for activity_id, stream_data in session.execute(statement):
        if not isinstance(stream_data, list):
            continue
        activity_has_point = False
        for item in stream_data:
            coordinate = _latlng_pair(item)
            if coordinate is None:
                continue
            point_count += 1
            activity_has_point = True
            lat, lng = coordinate
            key = (round(lat, safe_precision), round(lng, safe_precision))
            cell = cells.setdefault(key, {"lat": key[0], "lng": key[1], "weight": 0, "activity_ids": set()})
            cell["weight"] += 1
            cell["activity_ids"].add(activity_id)
        if activity_has_point:
            activity_ids.add(activity_id)

    points = [
        {
            "lat": cell["lat"],
            "lng": cell["lng"],
            "weight": cell["weight"],
            "activity_count": len(cell["activity_ids"]),
        }
        for cell in cells.values()
    ]
    points.sort(key=lambda point: (-point["weight"], point["lat"], point["lng"]))
    points = points[:safe_limit]
    bounds = _heatmap_bounds(points)
    return {
        "points": points,
        "bounds": bounds,
        "activity_count": len(activity_ids),
        "point_count": point_count,
    }


def _latlng_pair(value: object) -> tuple[float, float] | None:
    """Return a validated latitude and longitude pair."""
    if not isinstance(value, list | tuple) or len(value) != 2:
        return None
    lat = value[0]
    lng = value[1]
    if not isinstance(lat, int | float) or not isinstance(lng, int | float):
        return None
    lat_float = float(lat)
    lng_float = float(lng)
    if not (-90 <= lat_float <= 90 and -180 <= lng_float <= 180):
        return None
    return lat_float, lng_float


def _heatmap_bounds(points: list[dict]) -> dict | None:
    """Return geographic bounds for heatmap points."""
    if not points:
        return None
    return {
        "south": min(point["lat"] for point in points),
        "west": min(point["lng"] for point in points),
        "north": max(point["lat"] for point in points),
        "east": max(point["lng"] for point in points),
    }


def _sum_decimal(values) -> Decimal:
    """Sum nullable decimal-like values."""
    return sum((value or Decimal("0") for value in values), Decimal("0"))


def _sum_load_between(activities: list[Activity], start: datetime, end: datetime) -> float:
    """Sum load for activities in a date-time window."""
    return sum(float(activity.computed_load or 0) for activity in activities if start <= _utc_activity_start(activity) < end)


def _weekly_intensity_seconds(
    session: Session,
    user_id: UUID,
    timezone: str,
    activities: list[Activity],
) -> tuple[int, int, int]:
    """Return weekly easy, moderate, and hard seconds from HR zones or labels."""
    easy_time_s = 0
    moderate_time_s = 0
    hard_time_s = 0
    for activity in activities:
        activity_easy_s, activity_moderate_s, activity_hard_s = _activity_intensity_seconds(
            session,
            user_id,
            timezone,
            activity,
        )
        easy_time_s += activity_easy_s
        moderate_time_s += activity_moderate_s
        hard_time_s += activity_hard_s
    return easy_time_s, moderate_time_s, hard_time_s


def _activity_intensity_seconds(
    session: Session,
    user_id: UUID,
    timezone: str,
    activity: Activity,
) -> tuple[int, int, int]:
    """Return one activity split into easy, moderate, and hard seconds."""
    breakdown = _activity_zone_breakdown(session, user_id, timezone, activity)
    if breakdown:
        return (
            sum(item.seconds for item in breakdown if item.zone_index in {0, 1}),
            sum(item.seconds for item in breakdown if item.zone_index == 2),
            sum(item.seconds for item in breakdown if item.zone_index in {3, 4}),
        )
    duration_s = activity.moving_time_s or 0
    if activity.intensity_class == "easy":
        return duration_s, 0, 0
    if activity.intensity_class == "moderate":
        return 0, duration_s, 0
    if activity.intensity_class == "hard":
        return 0, 0, duration_s
    return 0, 0, 0


def _activity_zone_breakdown(
    session: Session,
    user_id: UUID,
    timezone: str,
    activity: Activity,
) -> list[HeartRateZoneBreakdownItem]:
    """Return HR-zone breakdown for one activity when possible."""
    hr_values = _heartrate_values(session, activity) or _average_hr_values(activity)
    if not hr_values:
        return []
    activity_date = local_date(activity.start_time_utc, timezone)
    zone_set = _effective_hr_zone_set(session, user_id, activity_date)
    if zone_set is None:
        return []
    hr_zones = _normalized_hr_zones(zone_set)
    if hr_zones is None:
        return []
    zone_names = [
        str(zone.get("name") or f"Z{index + 1}")
        for index, zone in enumerate(zone_set.zones)
    ]
    return calculate_heart_rate_zone_breakdown(
        activity.moving_time_s,
        hr_values,
        hr_zones,
        zone_names,
    )


def _heartrate_values(session: Session, activity: Activity) -> list[int | float] | None:
    """Return numeric heart-rate stream values for an activity."""
    stream = session.scalar(
        select(ActivityStream).where(
            ActivityStream.activity_id == activity.id,
            ActivityStream.stream_type == "heartrate",
        )
    )
    if stream is None or not isinstance(stream.data, list):
        return None
    values = [
        value
        for value in stream.data
        if isinstance(value, int | float) and not isinstance(value, bool)
    ]
    return values or None


def _average_hr_values(activity: Activity) -> list[float] | None:
    """Return average heart rate as a single sample."""
    if activity.average_hr is None:
        return None
    return [float(activity.average_hr)]


def _effective_hr_zone_set(
    session: Session,
    user_id: UUID,
    activity_date: date,
) -> HeartRateZoneSet | None:
    """Return the HR zone set effective on an activity date."""
    return session.scalar(
        select(HeartRateZoneSet)
        .where(
            HeartRateZoneSet.user_id == user_id,
            HeartRateZoneSet.effective_from <= activity_date,
        )
        .order_by(HeartRateZoneSet.effective_from.desc())
        .limit(1)
    )


def _normalized_hr_zones(zone_set: HeartRateZoneSet) -> list[tuple[int, int]] | None:
    """Return normalized HR zone boundaries or none when stored data is invalid."""
    if len(zone_set.zones) != 5:
        return None
    try:
        return [(int(zone["min_hr"]), int(zone["max_hr"])) for zone in zone_set.zones]
    except (KeyError, TypeError, ValueError):
        return None


def _utc_activity_start(activity: Activity) -> datetime:
    """Return an activity start timestamp as timezone-aware UTC."""
    started_at = activity.start_time_utc
    if started_at.tzinfo is None:
        return started_at.replace(tzinfo=UTC)
    return started_at.astimezone(UTC)


def _utc_datetime(value: datetime) -> datetime:
    """Return a datetime value as timezone-aware UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _weekly_dict(metric: WeeklyMetric) -> dict:
    """Convert a weekly metric to a JSON-friendly dictionary."""
    return {
        "week_start_date": metric.week_start_date.isoformat(),
        "distance_m": float(metric.distance_m),
        "moving_time_s": metric.moving_time_s,
        "elevation_gain_m": float(metric.elevation_gain_m),
        "run_count": metric.run_count,
        "load": float(metric.load),
        "acute_load": float(metric.acute_load),
        "chronic_load": float(metric.chronic_load),
        "ramp_ratio": float(metric.ramp_ratio) if metric.ramp_ratio is not None else None,
        "easy_time_s": metric.easy_time_s,
        "moderate_time_s": metric.moderate_time_s,
        "hard_time_s": metric.hard_time_s,
        "unknown_time_s": metric.unknown_time_s,
        "long_run_distance_m": float(metric.long_run_distance_m),
    }


def _empty_weekly_dict(week_start_date: date) -> dict:
    """Create a zero-filled weekly metric dictionary."""
    return {
        "week_start_date": week_start_date.isoformat(),
        "distance_m": 0.0,
        "moving_time_s": 0,
        "elevation_gain_m": 0.0,
        "run_count": 0,
        "load": 0.0,
        "acute_load": 0.0,
        "chronic_load": 0.0,
        "ramp_ratio": None,
        "easy_time_s": 0,
        "moderate_time_s": 0,
        "hard_time_s": 0,
        "unknown_time_s": 0,
        "long_run_distance_m": 0.0,
    }


def _week_starts(first_week_start: date, count: int) -> list[date]:
    """Return sequential week start dates."""
    return [first_week_start + timedelta(days=index * 7) for index in range(count)]


def _activity_summary(activity: Activity | None) -> dict:
    """Convert an activity to a compact dictionary."""
    if activity is None:
        return {}
    return {
        "id": str(activity.id),
        "name": activity.name,
        "sport_type": activity.sport_type,
        "start_time_utc": activity.start_time_utc.isoformat(),
        "distance_m": float(activity.distance_m or 0),
        "moving_time_s": activity.moving_time_s or 0,
        "computed_load": float(activity.computed_load or 0),
        "intensity_class": activity.intensity_class,
    }


def _workout_summary(workout: PlannedWorkout) -> dict:
    """Convert a planned workout to a compact dictionary."""
    return {
        "id": str(workout.id),
        "scheduled_date": workout.scheduled_date.isoformat(),
        "session_label": workout.session_label,
        "sort_order": workout.sort_order,
        "title": workout.title,
        "workout_type": workout.workout_type,
        "target_distance_m": float(workout.target_distance_m or 0),
        "target_duration_s": workout.target_duration_s,
        "target_intensity": workout.target_intensity,
        "status": workout.status,
    }


def _week_plan_comparison(
    session: Session,
    user_id: UUID,
    timezone: str,
    today: date,
    week_start_date: date,
    week_end_date: date,
) -> dict:
    """Build current-week planned-vs-completed comparison data."""
    planned = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= week_start_date,
                PlannedWorkout.scheduled_date <= week_end_date,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    planned = deduplicate_planned_workouts_by_session(planned)
    activities = list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user_id,
                Activity.sport_type.in_(RUNNING_TYPES),
                Activity.start_time_utc >= start_of_day(week_start_date, timezone),
                Activity.start_time_utc < start_of_day(week_end_date + timedelta(days=1), timezone),
            )
            .order_by(Activity.start_time_utc)
        )
    )
    matched_activity_ids: set[UUID] = set()
    rows: list[dict] = []
    for workout in planned:
        activity = _match_planned_workout(workout, activities, matched_activity_ids, timezone)
        if activity is not None:
            matched_activity_ids.add(activity.id)
        rows.append(_comparison_row(workout, activity, timezone, today))
    for activity in activities:
        if activity.id not in matched_activity_ids:
            rows.append(_comparison_row(None, activity, timezone, today))
    rows.sort(key=lambda row: (row["date"], row["planned_title"] or row["activity_name"] or ""))
    planned_distance = sum(float(workout.target_distance_m or 0) for workout in planned)
    planned_time = sum(workout.target_duration_s or 0 for workout in planned)
    planned_load = sum(_planned_workout_load(workout) for workout in planned)
    completed_distance = sum(float(activity.distance_m or 0) for activity in activities)
    completed_time = sum(activity.moving_time_s or 0 for activity in activities)
    completed_load = sum(float(activity.computed_load or 0) for activity in activities)
    remaining_workouts = [workout for workout in planned if not _has_matched_row(rows, workout.id) and workout.scheduled_date >= today and workout.workout_type != "rest"]
    missed_workouts = [workout for workout in planned if not _has_matched_row(rows, workout.id) and workout.scheduled_date < today and workout.workout_type != "rest"]
    return {
        "week_start_date": week_start_date.isoformat(),
        "week_end_date": week_end_date.isoformat(),
        "planned_distance_m": planned_distance,
        "completed_distance_m": completed_distance,
        "remaining_distance_m": sum(float(workout.target_distance_m or 0) for workout in remaining_workouts),
        "distance_delta_m": completed_distance - planned_distance,
        "planned_time_s": planned_time,
        "completed_time_s": completed_time,
        "remaining_time_s": sum(workout.target_duration_s or 0 for workout in remaining_workouts),
        "duration_delta_s": completed_time - planned_time,
        "planned_load": planned_load,
        "completed_load": completed_load,
        "load_delta": completed_load - planned_load,
        "planned_sessions": sum(1 for workout in planned if workout.workout_type != "rest"),
        "completed_sessions": len(activities),
        "remaining_sessions": len(remaining_workouts),
        "missed_sessions": len(missed_workouts),
        "extra_sessions": sum(1 for row in rows if row["outcome"] == "extra"),
        "rows": rows,
    }


def _match_planned_workout(
    workout: PlannedWorkout,
    activities: list[Activity],
    matched_activity_ids: set[UUID],
    timezone: str,
) -> Activity | None:
    """Return the best same-day activity match for a planned workout."""
    if workout.completed_activity_id is not None:
        linked = next((activity for activity in activities if activity.id == workout.completed_activity_id), None)
        if linked is not None and linked.id not in matched_activity_ids:
            return linked
    return next(
        (
            activity
            for activity in activities
            if activity.id not in matched_activity_ids and local_date(activity.start_time_utc, timezone) == workout.scheduled_date
        ),
        None,
    )


def _comparison_row(
    workout: PlannedWorkout | None,
    activity: Activity | None,
    timezone: str,
    today: date,
) -> dict:
    """Build one planned-vs-completed dashboard row."""
    row_date = workout.scheduled_date if workout is not None else local_date(activity.start_time_utc, timezone)  # type: ignore[union-attr]
    planned_distance = float(workout.target_distance_m or 0) if workout is not None else 0
    actual_distance = float(activity.distance_m or 0) if activity is not None else 0
    planned_duration = workout.target_duration_s if workout is not None else None
    actual_duration = activity.moving_time_s if activity is not None else None
    planned_intensity = workout.target_intensity if workout is not None else None
    actual_intensity = activity.intensity_class if activity is not None else None
    return {
        "date": row_date.isoformat(),
        "planned_workout_id": str(workout.id) if workout is not None else None,
        "planned_session_label": workout.session_label if workout is not None else None,
        "planned_sort_order": workout.sort_order if workout is not None else None,
        "planned_title": workout.title if workout is not None else None,
        "planned_type": workout.workout_type if workout is not None else None,
        "planned_intensity": planned_intensity,
        "planned_distance_m": planned_distance,
        "planned_duration_s": planned_duration,
        "activity_id": str(activity.id) if activity is not None else None,
        "activity_name": activity.name if activity is not None else None,
        "actual_intensity": actual_intensity,
        "actual_distance_m": actual_distance,
        "actual_duration_s": actual_duration,
        "distance_delta_m": actual_distance - planned_distance,
        "duration_delta_s": (actual_duration or 0) - (planned_duration or 0),
        "intensity_match": _intensity_matches(planned_intensity, actual_intensity),
        "outcome": _comparison_outcome(workout, activity, today, planned_distance, actual_distance),
    }


def _comparison_outcome(
    workout: PlannedWorkout | None,
    activity: Activity | None,
    today: date,
    planned_distance: float,
    actual_distance: float,
) -> str:
    """Return a simple adherence outcome label."""
    if workout is None:
        return "extra"
    if activity is None:
        if workout.workout_type == "rest":
            return "rest"
        return "missed" if workout.scheduled_date < today else "waiting"
    if not _intensity_matches(workout.target_intensity, activity.intensity_class):
        return "different_intensity"
    if planned_distance > 0 and actual_distance > planned_distance * 1.1:
        return "more"
    if planned_distance > 0 and actual_distance < planned_distance * 0.9:
        return "less"
    return "as_planned"


def _intensity_matches(planned_intensity: str | None, actual_intensity: str | None) -> bool | None:
    """Return whether planned and actual intensity values match."""
    if not planned_intensity or not actual_intensity:
        return None
    if planned_intensity == "rest":
        return actual_intensity == "rest"
    return planned_intensity == actual_intensity


def _planned_workout_load(workout: PlannedWorkout) -> float:
    """Estimate planned workout load from target duration and intensity."""
    if workout.workout_type == "rest":
        return 0
    factor = {"easy": 2, "moderate": 4, "hard": 6, "race": 8, "rest": 0}.get(workout.target_intensity or "easy", 2)
    return ((workout.target_duration_s or 0) / 60) * factor


def _has_matched_row(rows: list[dict], workout_id: UUID) -> bool:
    """Return whether a planned workout already has a matched activity row."""
    return any(row["planned_workout_id"] == str(workout_id) and row["activity_id"] is not None for row in rows)
