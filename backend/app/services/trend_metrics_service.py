from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from math import sqrt
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.intensity import HeartRateZoneBreakdownItem, calculate_heart_rate_zone_breakdown
from app.core.time import local_date, start_of_day, utc_now, week_start
from app.models import Activity, ActivityStream, HeartRateZoneSet, PlannedWorkout, User
from app.services.analytics_service import RUNNING_TYPES
from app.services.planning_service import deduplicate_planned_workouts_by_session

ZONE_COUNT = 5
PLANNED_LOAD_FACTORS = {"easy": 2, "moderate": 4, "hard": 6, "race": 8, "rest": 0}
MIN_ZONE_PACE_S_PER_KM = 120
MAX_ZONE_PACE_S_PER_KM = 1800


def trend_metrics(session: Session, user_id: UUID, weeks: int = 13) -> list[dict]:
    """Return dense weekly trend metrics for the owner."""
    safe_weeks = max(1, min(weeks, 52))
    user = session.get(User, user_id)
    timezone = user.timezone if user is not None else "Europe/Prague"
    current_week_start = week_start(local_date(utc_now(), timezone))
    first_week_start = current_week_start - timedelta(days=(safe_weeks - 1) * 7)
    week_starts = [first_week_start + timedelta(days=index * 7) for index in range(safe_weeks)]
    weeks_by_start = {start: _empty_trend_week(start) for start in week_starts}
    range_start = start_of_day(first_week_start, timezone)
    range_end = start_of_day(current_week_start + timedelta(days=7), timezone)
    activities = _running_activities(session, user_id, range_start, range_end)
    streams_by_activity = _streams_by_activity(session, [activity.id for activity in activities])
    zone_sets = _zone_sets(session, user_id, current_week_start + timedelta(days=6))
    planned = _planned_workouts(session, user_id, first_week_start, current_week_start + timedelta(days=6))

    for activity in activities:
        _add_activity_to_week(weeks_by_start, activity, streams_by_activity.get(activity.id, []), zone_sets, timezone)
    for workout in planned:
        _add_workout_to_week(weeks_by_start, workout)
    finalized = [_finalize_trend_week(weeks_by_start[start]) for start in week_starts]
    return _with_coach_effect(finalized)


def _running_activities(session: Session, user_id: UUID, range_start, range_end) -> list[Activity]:
    """Return owner running activities in the UTC range."""
    return list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user_id,
                Activity.sport_type.in_(RUNNING_TYPES),
                Activity.start_time_utc >= range_start,
                Activity.start_time_utc < range_end,
            )
            .order_by(Activity.start_time_utc)
        )
    )


def _streams_by_activity(session: Session, activity_ids: list[UUID]) -> dict[UUID, list[ActivityStream]]:
    """Return streams grouped by activity id."""
    if not activity_ids:
        return {}
    grouped: dict[UUID, list[ActivityStream]] = defaultdict(list)
    streams = session.scalars(select(ActivityStream).where(ActivityStream.activity_id.in_(activity_ids)))
    for stream in streams:
        grouped[stream.activity_id].append(stream)
    return dict(grouped)


def _zone_sets(session: Session, user_id: UUID, latest_date: date) -> list[HeartRateZoneSet]:
    """Return owner zone sets that can apply to the trend range."""
    return list(
        session.scalars(
            select(HeartRateZoneSet)
            .where(HeartRateZoneSet.user_id == user_id, HeartRateZoneSet.effective_from <= latest_date)
            .order_by(HeartRateZoneSet.effective_from)
        )
    )


def _planned_workouts(
    session: Session,
    user_id: UUID,
    first_week_start: date,
    last_week_end: date,
) -> list[PlannedWorkout]:
    """Return planned workouts in the local date range."""
    workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= first_week_start,
                PlannedWorkout.scheduled_date <= last_week_end,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    return deduplicate_planned_workouts_by_session(workouts)


def _empty_trend_week(week_start_date: date) -> dict:
    """Create an empty mutable trend week accumulator."""
    return {
        "week_start_date": week_start_date,
        "distance_m": 0.0,
        "moving_time_s": 0,
        "elevation_gain_m": 0.0,
        "run_count": 0,
        "load": 0.0,
        "zone_seconds": [0 for _ in range(ZONE_COUNT)],
        "zone_distance_m": [0.0 for _ in range(ZONE_COUNT)],
        "zone_pace_seconds": [0.0 for _ in range(ZONE_COUNT)],
        "easy_pace_seconds": 0.0,
        "easy_pace_distance_m": 0.0,
        "long_run_distance_m": 0.0,
        "run_dates": set(),
        "daily_loads": [0.0 for _ in range(7)],
        "planned_distance_m": 0.0,
        "planned_time_s": 0,
        "planned_load": 0.0,
        "planned_items": 0,
        "planned_sessions": 0,
        "planned_hard_sessions": 0,
    }


def _add_activity_to_week(
    weeks_by_start: dict[date, dict],
    activity: Activity,
    streams: list[ActivityStream],
    zone_sets: list[HeartRateZoneSet],
    timezone: str,
) -> None:
    """Add one activity to its weekly trend accumulator."""
    activity_date = local_date(activity.start_time_utc, timezone)
    start = week_start(activity_date)
    week = weeks_by_start.get(start)
    if week is None:
        return
    distance_m = float(activity.distance_m or 0)
    moving_time_s = int(activity.moving_time_s or 0)
    load = float(activity.computed_load or 0)
    week["distance_m"] += distance_m
    week["moving_time_s"] += moving_time_s
    week["elevation_gain_m"] += float(activity.elevation_gain_m or 0)
    week["run_count"] += 1
    week["load"] += load
    week["long_run_distance_m"] = max(week["long_run_distance_m"], distance_m)
    week["run_dates"].add(activity_date)
    week["daily_loads"][(activity_date - start).days] += load
    zone_set = _effective_zone_set(zone_sets, activity_date)
    breakdown = _activity_zone_breakdown(activity, streams, zone_set)
    if breakdown:
        for item in breakdown:
            if item.zone_index < ZONE_COUNT:
                week["zone_seconds"][item.zone_index] += item.seconds
    if _is_easy_activity(activity, breakdown, moving_time_s):
        week["easy_pace_seconds"] += moving_time_s
        week["easy_pace_distance_m"] += distance_m
    zone_seconds, zone_distance = _activity_zone_pace_parts(streams, zone_set)
    for index in range(ZONE_COUNT):
        week["zone_pace_seconds"][index] += zone_seconds[index]
        week["zone_distance_m"][index] += zone_distance[index]


def _add_workout_to_week(weeks_by_start: dict[date, dict], workout: PlannedWorkout) -> None:
    """Add one planned workout to its weekly trend accumulator."""
    start = week_start(workout.scheduled_date)
    week = weeks_by_start.get(start)
    if week is None:
        return
    week["planned_items"] += 1
    week["planned_distance_m"] += float(workout.target_distance_m or 0)
    week["planned_time_s"] += workout.target_duration_s or 0
    week["planned_load"] += _planned_workout_load(workout)
    if workout.workout_type != "rest":
        week["planned_sessions"] += 1
    if workout.target_intensity in {"hard", "race"} or workout.workout_type in {"tempo", "intervals", "hills", "race"}:
        week["planned_hard_sessions"] += 1


def _finalize_trend_week(week: dict) -> dict:
    """Return the public trend metric dictionary for one week."""
    distance_m = week["distance_m"]
    planned_distance_m = week["planned_distance_m"]
    planned_time_s = week["planned_time_s"]
    planned_load = week["planned_load"]
    return {
        "week_start_date": week["week_start_date"].isoformat(),
        "distance_m": round(distance_m, 2),
        "moving_time_s": week["moving_time_s"],
        "elevation_gain_m": round(week["elevation_gain_m"], 2),
        "run_count": week["run_count"],
        "load": round(week["load"], 2),
        "zone_seconds": week["zone_seconds"],
        "easy_pace_s_per_km": _pace(week["easy_pace_seconds"], week["easy_pace_distance_m"]),
        "long_run_share": _percentage(week["long_run_distance_m"], distance_m),
        "run_day_count": len(week["run_dates"]),
        "elevation_gain_per_km": _per_km(week["elevation_gain_m"], distance_m),
        "zone_paces_s_per_km": [
            _pace(week["zone_pace_seconds"][index], week["zone_distance_m"][index])
            for index in range(ZONE_COUNT)
        ],
        "planned_distance_m": round(planned_distance_m, 2),
        "completed_distance_m": round(distance_m, 2),
        "planned_time_s": planned_time_s,
        "completed_time_s": week["moving_time_s"],
        "planned_load": round(planned_load, 2),
        "completed_load": round(week["load"], 2),
        "distance_adherence": _percentage(distance_m, planned_distance_m) if planned_distance_m > 0 else None,
        "time_adherence": _percentage(week["moving_time_s"], planned_time_s) if planned_time_s > 0 else None,
        "load_adherence": _percentage(week["load"], planned_load) if planned_load > 0 else None,
        "monotony": _monotony(week["daily_loads"]),
        "planned_items": week["planned_items"],
        "planned_sessions": week["planned_sessions"],
        "planned_hard_sessions": week["planned_hard_sessions"],
    }


def _with_coach_effect(weeks: list[dict]) -> list[dict]:
    """Add coach-effect verdict fields to finalized trend weeks."""
    enriched: list[dict] = []
    active_history: list[dict] = []
    for week in weeks:
        previous_active = active_history[-1] if active_history else None
        baseline_easy_pace = _average_recent_easy_pace(active_history[-4:])
        coach_effect = _coach_effect_for_week(week, baseline_easy_pace, previous_active)
        public_week = _public_trend_week(week)
        public_week.update(coach_effect)
        enriched.append(public_week)
        if week["moving_time_s"] > 0:
            active_history.append(week)
    return enriched


def _public_trend_week(week: dict) -> dict:
    """Remove private coach accumulator fields from a trend week."""
    public_planned_fields = {"planned_distance_m", "planned_time_s", "planned_load"}
    return {
        key: value
        for key, value in week.items()
        if not key.startswith("planned_") or key in public_planned_fields
    }


def _coach_effect_for_week(
    week: dict,
    baseline_easy_pace: float | None,
    previous_active: dict | None,
) -> dict[str, str]:
    """Return plan intent, delivered stimulus, body response, and recommendation codes."""
    intent = _coach_intent(week)
    stimulus = _coach_stimulus(week)
    response = _coach_response(week, stimulus, baseline_easy_pace, previous_active)
    return {
        "coach_intent": intent,
        "coach_stimulus": stimulus,
        "coach_response": response,
        "coach_recommendation": _coach_recommendation(intent, stimulus, response),
    }


def _coach_intent(week: dict) -> str:
    """Classify the intended training stimulus for one planned week."""
    if week["planned_sessions"] == 0:
        return "recovery" if week["planned_items"] > 0 else "unplanned"
    if week["planned_load"] <= 0:
        return "recovery"
    if week["planned_hard_sessions"] > 0:
        return "quality"
    return "base"


def _coach_stimulus(week: dict) -> str:
    """Classify whether completed training delivered the planned stimulus."""
    if week["planned_sessions"] == 0:
        return "no_plan"
    adherence_values = [
        value
        for value in (week["load_adherence"], week["distance_adherence"], week["time_adherence"])
        if value is not None
    ]
    if not adherence_values:
        return "no_signal"
    primary = adherence_values[0]
    if primary < 80:
        return "too_low"
    if primary > 120:
        return "too_high"
    return "on_target"


def _coach_response(
    week: dict,
    stimulus: str,
    baseline_easy_pace: float | None,
    previous_active: dict | None,
) -> str:
    """Classify the observed body response to recent training."""
    if week["moving_time_s"] <= 0:
        return "no_signal"
    previous_load = previous_active["load"] if previous_active else 0
    if week["monotony"] is not None and week["monotony"] >= 2.0:
        return "fatigue_risk"
    if previous_load > 0 and week["load"] > previous_load * 1.35:
        return "fatigue_risk"
    easy_pace = week["easy_pace_s_per_km"]
    if baseline_easy_pace is not None and easy_pace is not None:
        pace_change = (easy_pace - baseline_easy_pace) / baseline_easy_pace
        if pace_change <= -0.02 and stimulus != "too_high":
            return "positive"
        if pace_change >= 0.03 and week["load"] >= previous_load:
            return "watch"
    if stimulus == "too_high":
        return "watch"
    return "no_signal"


def _coach_recommendation(intent: str, stimulus: str, response: str) -> str:
    """Return a next-step recommendation code for the coach panel."""
    if response == "fatigue_risk" or stimulus == "too_high":
        return "reduce_load"
    if stimulus == "too_low":
        return "improve_adherence"
    if response == "positive":
        return "keep_plan"
    if intent == "unplanned":
        return "add_plan"
    return "collect_more_data"


def _average_recent_easy_pace(weeks: list[dict]) -> float | None:
    """Return average easy pace from recent active weeks."""
    paces = [week["easy_pace_s_per_km"] for week in weeks if week["easy_pace_s_per_km"] is not None]
    if not paces:
        return None
    return sum(paces) / len(paces)


def _activity_zone_breakdown(
    activity: Activity,
    streams: list[ActivityStream],
    zone_set: HeartRateZoneSet | None,
) -> list[HeartRateZoneBreakdownItem]:
    """Return HR-zone breakdown for an activity when possible."""
    if zone_set is None:
        return []
    hr_values = _numeric_stream(streams, "heartrate") or _average_hr_values(activity)
    if not hr_values:
        return []
    hr_zones = _normalized_hr_zones(zone_set)
    if hr_zones is None:
        return []
    zone_names = [
        str(zone.get("name") or f"Z{index + 1}")
        for index, zone in enumerate(zone_set.zones)
    ]
    return calculate_heart_rate_zone_breakdown(activity.moving_time_s, hr_values, hr_zones, zone_names)


def _activity_zone_pace_parts(
    streams: list[ActivityStream],
    zone_set: HeartRateZoneSet | None,
) -> tuple[list[float], list[float]]:
    """Return seconds and distance accumulated by HR zone from aligned streams."""
    seconds = [0.0 for _ in range(ZONE_COUNT)]
    distance = [0.0 for _ in range(ZONE_COUNT)]
    if zone_set is None:
        return seconds, distance
    hr_zones = _normalized_hr_zones(zone_set)
    if hr_zones is None:
        return seconds, distance
    time_stream = _numeric_stream(streams, "time")
    distance_stream = _numeric_stream(streams, "distance")
    heartrate_stream = _numeric_stream(streams, "heartrate")
    sample_count = min(len(time_stream), len(distance_stream), len(heartrate_stream))
    if sample_count < 2:
        return seconds, distance
    for index in range(1, sample_count):
        delta_time = max(0.0, time_stream[index] - time_stream[index - 1])
        delta_distance = max(0.0, distance_stream[index] - distance_stream[index - 1])
        if delta_time <= 0 or delta_distance <= 0:
            continue
        if not _is_plausible_zone_pace(delta_time, delta_distance):
            continue
        zone_index = min(_zone_index(heartrate_stream[index], hr_zones), ZONE_COUNT - 1)
        seconds[zone_index] += delta_time
        distance[zone_index] += delta_distance
    return seconds, distance


def _numeric_stream(streams: list[ActivityStream], stream_type: str) -> list[float]:
    """Return numeric stream values for one stream type."""
    stream = next((item for item in streams if item.stream_type == stream_type), None)
    if stream is None or not isinstance(stream.data, list):
        return []
    return [
        float(value)
        for value in stream.data
        if isinstance(value, int | float) and not isinstance(value, bool)
    ]


def _average_hr_values(activity: Activity) -> list[float]:
    """Return the average HR as one sample when available."""
    if activity.average_hr is None:
        return []
    return [float(activity.average_hr)]


def _effective_zone_set(zone_sets: list[HeartRateZoneSet], activity_date: date) -> HeartRateZoneSet | None:
    """Return the zone set effective on the given activity date."""
    effective = [zone_set for zone_set in zone_sets if zone_set.effective_from <= activity_date]
    return effective[-1] if effective else None


def _normalized_hr_zones(zone_set: HeartRateZoneSet) -> list[tuple[int, int]] | None:
    """Return normalized HR zone boundaries or none for invalid data."""
    if len(zone_set.zones) != ZONE_COUNT:
        return None
    try:
        return [(int(zone["min_hr"]), int(zone["max_hr"])) for zone in zone_set.zones]
    except (KeyError, TypeError, ValueError):
        return None


def _zone_index(hr: float, hr_zones: list[tuple[int, int]]) -> int:
    """Return the index of the HR zone containing the value."""
    if hr < hr_zones[0][0]:
        return 0
    if hr > hr_zones[-1][1]:
        return len(hr_zones) - 1
    for index, (zone_min, zone_max) in enumerate(hr_zones):
        if zone_min <= hr <= zone_max:
            return index
        if hr < zone_min:
            return max(index - 1, 0)
    return len(hr_zones) - 1


def _is_easy_activity(
    activity: Activity,
    breakdown: list[HeartRateZoneBreakdownItem],
    moving_time_s: int,
) -> bool:
    """Return whether an activity should contribute to easy pace."""
    if breakdown and moving_time_s > 0:
        easy_seconds = sum(item.seconds for item in breakdown if item.zone_index in {0, 1})
        return easy_seconds / moving_time_s >= 0.70
    return activity.intensity_class == "easy"


def _planned_workout_load(workout: PlannedWorkout) -> float:
    """Return simple planned workout load."""
    factor = PLANNED_LOAD_FACTORS.get(workout.target_intensity or "easy", 2)
    return ((workout.target_duration_s or 0) / 60) * factor


def _is_plausible_zone_pace(seconds: float, distance_m: float) -> bool:
    """Return whether a stream segment has a plausible running pace."""
    segment_pace = _pace(seconds, distance_m)
    if segment_pace is None:
        return False
    return MIN_ZONE_PACE_S_PER_KM <= segment_pace <= MAX_ZONE_PACE_S_PER_KM


def _pace(seconds: float, distance_m: float) -> float | None:
    """Return seconds per kilometer from seconds and meters."""
    if distance_m <= 0:
        return None
    return round(seconds / (distance_m / 1000), 1)


def _percentage(value: float, total: float) -> float:
    """Return a rounded percentage value."""
    if total <= 0:
        return 0.0
    return round((value / total) * 100, 1)


def _per_km(value: float, distance_m: float) -> float:
    """Return a rounded value per kilometer."""
    if distance_m <= 0:
        return 0.0
    return round(value / (distance_m / 1000), 1)


def _monotony(daily_loads: list[float]) -> float | None:
    """Return weekly training monotony from daily load values."""
    if sum(daily_loads) <= 0:
        return None
    mean = sum(daily_loads) / len(daily_loads)
    variance = sum((load - mean) ** 2 for load in daily_loads) / len(daily_loads)
    standard_deviation = sqrt(variance)
    if standard_deviation <= 0:
        return None
    return round(mean / standard_deviation, 2)
