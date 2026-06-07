from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.core.time import local_date, start_of_day, utc_now
from app.models import Activity, Event, PlannedWorkout, User, UserPreference
from app.schemas.event import (
    EventCreate,
    EventGuidanceMessage,
    EventPlanningGuidance,
    EventPreparation,
    EventReadiness,
    EventReadinessIntensityMix,
    EventReadinessItem,
    EventRead,
    EventSuggestedSession,
    EventUpdate,
)
from app.services.analytics_service import RUNNING_TYPES
from app.services.planning_service import deduplicate_planned_workouts_by_session


def create_event(session: Session, user: User, payload: EventCreate) -> Event:
    """Create an owner event."""
    event = Event(user_id=user.id, **payload.model_dump())
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def list_events(session: Session, user: User) -> list[EventRead]:
    """Return owner events with calculated fields."""
    events = list(session.scalars(select(Event).where(Event.user_id == user.id).order_by(Event.event_date)))
    return [event_to_read(session, user, event) for event in events]


def get_event_for_user(session: Session, user_id: UUID, event_id: UUID) -> Event:
    """Return one owner event."""
    event = session.scalar(select(Event).where(Event.id == event_id, Event.user_id == user_id))
    if event is None:
        raise AppException(404, "EVENT_NOT_FOUND", "Event was not found")
    return event


def update_event(session: Session, event: Event, payload: EventUpdate) -> Event:
    """Update one owner event."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.commit()
    session.refresh(event)
    return event


def delete_event(session: Session, event: Event) -> None:
    """Delete one owner event."""
    session.delete(event)
    session.commit()


def event_to_read(session: Session, user: User, event: Event) -> EventRead:
    """Convert an event to API output with preparation metrics."""
    today = local_date(utc_now(), user.timezone)
    days_until = (event.event_date - today).days
    distance_m = float(event.distance_m or 0)
    target_pace = _target_pace_s_per_km(event)
    return EventRead(
        id=event.id,
        name=event.name,
        event_date=event.event_date,
        location=event.location,
        event_type=event.event_type,
        distance_m=distance_m if event.distance_m is not None else None,
        elevation_gain_m=float(event.elevation_gain_m) if event.elevation_gain_m is not None else None,
        surface=event.surface,
        priority=event.priority,
        status=event.status,
        target_time_s=event.target_time_s,
        website_url=event.website_url,
        course_map_url=event.course_map_url,
        course_gpx=event.course_gpx,
        poster_image_data=event.poster_image_data,
        goal_notes=event.goal_notes,
        course_notes=event.course_notes,
        fueling_notes=event.fueling_notes,
        gear_notes=event.gear_notes,
        travel_notes=event.travel_notes,
        days_until_start=days_until,
        weeks_until_start=round(days_until / 7, 1),
        target_pace_s_per_km=round(target_pace, 2) if target_pace is not None else None,
        preparation=calculate_event_preparation(session, user, event, today),
    )


def event_planning_guidance(session: Session, user: User, event: Event) -> EventPlanningGuidance:
    """Return transparent planning guidance for one event."""
    today = local_date(utc_now(), user.timezone)
    locale = _user_locale(session, user.id)
    preparation = calculate_event_preparation(session, user, event, today)
    event_distance = float(event.distance_m or 0)
    recent_weekly_distance = preparation.current_4w_distance_m / 4 if preparation.current_4w_distance_m > 0 else 0
    suggested_weekly_distance = _suggested_weekly_distance(event_distance, recent_weekly_distance)
    suggested_long_run = _suggested_long_run_distance(event_distance, preparation.longest_run_8w_m)
    return EventPlanningGuidance(
        event_id=event.id,
        phase=preparation.phase,
        weeks_until_start=round((event.event_date - today).days / 7, 1),
        suggested_weekly_distance_m=round(suggested_weekly_distance, 2),
        suggested_long_run_m=round(suggested_long_run, 2) if suggested_long_run is not None else None,
        suggested_sessions=_suggested_sessions(event, suggested_weekly_distance, locale),
        messages=_guidance_messages(event, preparation, locale),
    )


def event_readiness(session: Session, user: User, event: Event) -> EventReadiness:
    """Return transparent readiness metrics for one event."""
    today = local_date(utc_now(), user.timezone)
    preparation = calculate_event_preparation(session, user, event, today)
    four_week_start = today - timedelta(days=27)
    recent_activities = _activities_between(session, user, four_week_start, today)
    intensity_mix = _readiness_intensity_mix(recent_activities)
    target_pace = _target_pace_s_per_km(event)
    locale = _user_locale(session, user.id)
    return EventReadiness(
        event_id=event.id,
        phase=preparation.phase,
        days_until_start=(event.event_date - today).days,
        target_pace_s_per_km=round(target_pace, 2) if target_pace is not None else None,
        recent_4w_distance_m=preparation.current_4w_distance_m,
        recent_4w_load=preparation.current_4w_load,
        recent_4w_run_count=len(recent_activities),
        longest_run_8w_m=preparation.longest_run_8w_m,
        long_run_event_distance_ratio=preparation.long_run_event_distance_ratio,
        planned_distance_to_event_m=preparation.planned_distance_to_event_m,
        planned_load_to_event=preparation.planned_load_to_event,
        planned_sessions_to_event=preparation.planned_sessions_to_event,
        missed_planned_sessions=preparation.missed_planned_sessions,
        intensity_mix=intensity_mix,
        readiness_items=_readiness_items(event, preparation, target_pace, len(recent_activities), intensity_mix, locale),
        guidance_messages=_guidance_messages(event, preparation, locale),
    )


def calculate_event_preparation(session: Session, user: User, event: Event, today: date | None = None) -> EventPreparation:
    """Calculate preparation metrics for one event."""
    current_date = today or local_date(utc_now(), user.timezone)
    four_week_start = current_date - timedelta(days=27)
    eight_week_start = current_date - timedelta(days=55)
    current_activities = _activities_between(session, user, four_week_start, current_date)
    eight_week_activities = _activities_between(session, user, eight_week_start, current_date)
    future_workouts = _planned_workouts_between(session, user.id, current_date, event.event_date)
    missed_workouts = _missed_planned_workouts(
        _planned_workouts_between(session, user.id, four_week_start, current_date - timedelta(days=1)),
        current_activities,
        user.timezone,
    )
    longest_run = max((float(activity.distance_m or 0) for activity in eight_week_activities), default=0.0)
    distance_m = float(event.distance_m or 0)
    return EventPreparation(
        phase=_preparation_phase(event, current_date),
        current_4w_distance_m=_sum_activity_distance(current_activities),
        current_4w_load=_sum_activity_load(current_activities),
        longest_run_8w_m=longest_run,
        long_run_event_distance_ratio=round(longest_run / distance_m, 2) if distance_m > 0 else None,
        planned_distance_to_event_m=sum(float(workout.target_distance_m or 0) for workout in future_workouts),
        planned_load_to_event=round(sum(_planned_workout_load(workout) for workout in future_workouts), 2),
        planned_sessions_to_event=sum(1 for workout in future_workouts if workout.workout_type != "rest"),
        completed_runs_since_created=len(current_activities),
        completed_distance_since_created_m=_sum_activity_distance(current_activities),
        completed_load_since_created=_sum_activity_load(current_activities),
        missed_planned_sessions=len(missed_workouts),
        easy_time_s=sum(activity.moving_time_s or 0 for activity in current_activities if activity.intensity_class == "easy"),
        moderate_time_s=sum(activity.moving_time_s or 0 for activity in current_activities if activity.intensity_class == "moderate"),
        hard_time_s=sum(activity.moving_time_s or 0 for activity in current_activities if activity.intensity_class == "hard"),
    )


def _activities_between(session: Session, user: User, start: date, end: date) -> list[Activity]:
    """Return running activities in an owner-local date window."""
    return list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user.id,
                Activity.sport_type.in_(RUNNING_TYPES),
                Activity.start_time_utc >= start_of_day(start, user.timezone),
                Activity.start_time_utc < start_of_day(end + timedelta(days=1), user.timezone),
            )
            .order_by(Activity.start_time_utc)
        )
    )


def _planned_workouts_between(session: Session, user_id: UUID, start: date, end: date) -> list[PlannedWorkout]:
    """Return planned workouts in a date window."""
    if end < start:
        return []
    workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= start,
                PlannedWorkout.scheduled_date <= end,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    return deduplicate_planned_workouts_by_session(workouts)


def _missed_planned_workouts(workouts: list[PlannedWorkout], activities: list[Activity], timezone: str) -> list[PlannedWorkout]:
    """Return planned workouts without a matching completed run."""
    matched_activity_ids: set[UUID] = set()
    missed: list[PlannedWorkout] = []
    for workout in workouts:
        if workout.workout_type == "rest" or workout.status not in {"planned", "skipped"}:
            continue
        activity = _match_planned_activity(workout, activities, matched_activity_ids, timezone)
        if activity is None:
            missed.append(workout)
        else:
            matched_activity_ids.add(activity.id)
    return missed


def _match_planned_activity(
    workout: PlannedWorkout,
    activities: list[Activity],
    matched_activity_ids: set[UUID],
    timezone: str,
) -> Activity | None:
    """Return a linked or same-day activity match for a planned workout."""
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


def _sum_activity_distance(activities: list[Activity]) -> float:
    """Sum activity distance."""
    return float(sum((activity.distance_m or Decimal("0") for activity in activities), Decimal("0")))


def _sum_activity_load(activities: list[Activity]) -> float:
    """Sum activity load."""
    return float(sum((activity.computed_load or Decimal("0") for activity in activities), Decimal("0")))


def _planned_workout_load(workout: PlannedWorkout) -> float:
    """Estimate planned workout load from duration and intensity."""
    if workout.workout_type == "rest":
        return 0
    factor = {"easy": 2, "moderate": 4, "hard": 6, "race": 8, "rest": 0}.get(workout.target_intensity or "easy", 2)
    return ((workout.target_duration_s or 0) / 60) * factor


def _target_pace_s_per_km(event: Event) -> float | None:
    """Return target pace seconds per kilometer for an event."""
    distance_m = float(event.distance_m or 0)
    if not event.target_time_s or distance_m <= 0:
        return None
    return event.target_time_s / (distance_m / 1000)


def _readiness_intensity_mix(activities: list[Activity]) -> EventReadinessIntensityMix:
    """Return recent activity intensity seconds for readiness."""
    easy = 0
    moderate = 0
    hard = 0
    unknown = 0
    for activity in activities:
        seconds = activity.moving_time_s or 0
        if activity.intensity_class == "easy":
            easy += seconds
        elif activity.intensity_class == "moderate":
            moderate += seconds
        elif activity.intensity_class == "hard":
            hard += seconds
        else:
            unknown += seconds
    return EventReadinessIntensityMix(
        easy_time_s=easy,
        moderate_time_s=moderate,
        hard_time_s=hard,
        unknown_time_s=unknown,
    )


def _readiness_items(
    event: Event,
    preparation: EventPreparation,
    target_pace_s_per_km: float | None,
    recent_run_count: int,
    intensity_mix: EventReadinessIntensityMix,
    locale: str,
) -> list[EventReadinessItem]:
    """Return transparent readiness metric items."""
    return [
        EventReadinessItem(
            key="target_pace",
            label=_localized_text(locale, "target_pace_item_label"),
            value=_format_pace_value(target_pace_s_per_km),
            detail=_localized_text(locale, "target_pace_item_detail"),
            status="good" if target_pace_s_per_km is not None else "missing",
        ),
        EventReadinessItem(
            key="recent_volume",
            label=_localized_text(locale, "recent_volume_item_label"),
            value=f"{_format_distance_value(preparation.current_4w_distance_m)} / {recent_run_count}",
            detail=_localized_text(locale, "recent_volume_item_detail"),
            status="good" if recent_run_count > 0 else "missing",
        ),
        EventReadinessItem(
            key="long_run",
            label=_localized_text(locale, "long_run_item_label"),
            value=_format_ratio_value(preparation.long_run_event_distance_ratio),
            detail=_localized_text(locale, "long_run_item_detail"),
            status=_long_run_status(preparation.long_run_event_distance_ratio),
        ),
        EventReadinessItem(
            key="future_plan",
            label=_localized_text(locale, "future_plan_item_label"),
            value=f"{_format_distance_value(preparation.planned_distance_to_event_m)} / {preparation.planned_sessions_to_event}",
            detail=_localized_text(locale, "future_plan_item_detail"),
            status=_future_plan_status(event, preparation),
        ),
        EventReadinessItem(
            key="missed_sessions",
            label=_localized_text(locale, "missed_sessions_item_label"),
            value=str(preparation.missed_planned_sessions),
            detail=_localized_text(locale, "missed_sessions_item_detail"),
            status="good" if preparation.missed_planned_sessions == 0 else "watch",
        ),
        EventReadinessItem(
            key="intensity_mix",
            label=_localized_text(locale, "intensity_mix_item_label"),
            value=_format_minutes_value(
                intensity_mix.easy_time_s
                + intensity_mix.moderate_time_s
                + intensity_mix.hard_time_s
                + intensity_mix.unknown_time_s
            ),
            detail=_localized_text(locale, "intensity_mix_item_detail"),
            status="good"
            if intensity_mix.easy_time_s + intensity_mix.moderate_time_s + intensity_mix.hard_time_s > 0
            else "missing",
        ),
    ]


def _long_run_status(ratio: float | None) -> str:
    """Return readiness status for long-run distance ratio."""
    if ratio is None or ratio <= 0:
        return "missing"
    if ratio >= 0.8:
        return "good"
    return "watch"


def _future_plan_status(event: Event, preparation: EventPreparation) -> str:
    """Return readiness status for future planned work."""
    if preparation.phase in {"completed", "cancelled"} or event.status in {"completed", "cancelled"}:
        return "neutral"
    if preparation.planned_sessions_to_event > 0:
        return "good"
    return "missing"


def _format_pace_value(seconds_per_km: float | None) -> str:
    """Return a readable pace value."""
    if seconds_per_km is None:
        return "n/a"
    rounded = round(seconds_per_km)
    minutes = rounded // 60
    seconds = rounded % 60
    return f"{minutes}:{seconds:02d}/km"


def _format_distance_value(distance_m: float) -> str:
    """Return a readable kilometer value."""
    return f"{distance_m / 1000:.1f} km"


def _format_ratio_value(ratio: float | None) -> str:
    """Return a readable percent ratio value."""
    if ratio is None:
        return "n/a"
    return f"{round(ratio * 100)}%"


def _format_minutes_value(seconds: int) -> str:
    """Return a readable minute value."""
    return f"{round(seconds / 60)} min"


def _preparation_phase(event: Event, today: date) -> str:
    """Return a simple preparation phase label."""
    days_until = (event.event_date - today).days
    if event.status in {"completed", "cancelled"}:
        return event.status
    if days_until < 0:
        return "completed"
    if days_until <= 6:
        return "race_week"
    if days_until <= 14:
        return "taper"
    if days_until <= 28:
        return "peak"
    if days_until <= 84:
        return "build"
    return "base"


def _suggested_weekly_distance(event_distance_m: float, recent_weekly_distance_m: float) -> float:
    """Estimate a conservative weekly distance target."""
    event_based = event_distance_m * 2.2 if event_distance_m > 0 else 12000
    if recent_weekly_distance_m <= 0:
        return event_based
    return max(recent_weekly_distance_m, min(recent_weekly_distance_m * 1.1, event_based))


def _suggested_long_run_distance(event_distance_m: float, current_long_run_m: float) -> float | None:
    """Estimate a useful long-run target for event preparation."""
    if event_distance_m <= 0:
        return None
    target = event_distance_m * 0.8
    return max(min(target, event_distance_m), min(current_long_run_m * 1.1, event_distance_m))


def _suggested_sessions(event: Event, weekly_distance_m: float, locale: str) -> list[EventSuggestedSession]:
    """Return simple weekly session suggestions for an event."""
    event_distance = float(event.distance_m or weekly_distance_m / 2)
    easy_distance = max(3000, weekly_distance_m * 0.3)
    long_distance = max(event_distance * 0.65, weekly_distance_m * 0.4)
    sessions = [
        EventSuggestedSession(
            workout_type="easy",
            title=_localized_text(locale, "easy_session_title"),
            target_intensity="easy",
            target_distance_m=round(easy_distance, 2),
            target_duration_s=None,
            detail=_localized_text(locale, "easy_session_detail"),
        ),
        EventSuggestedSession(
            workout_type="long",
            title=_localized_text(locale, "long_session_title"),
            target_intensity="easy",
            target_distance_m=round(long_distance, 2),
            target_duration_s=None,
            detail=_localized_text(locale, "long_session_detail"),
        ),
    ]
    if event.event_type in {"5k", "10k", "half_marathon", "marathon"}:
        sessions.append(
            EventSuggestedSession(
                workout_type="tempo",
                title=_localized_text(locale, "quality_session_title"),
                target_intensity="moderate",
                target_distance_m=round(max(4000, event_distance * 0.45), 2),
                target_duration_s=None,
                detail=_localized_text(locale, "quality_session_detail"),
            )
        )
    return sessions


def _guidance_messages(event: Event, preparation: EventPreparation, locale: str) -> list[EventGuidanceMessage]:
    """Return readable event preparation guidance messages."""
    messages: list[EventGuidanceMessage] = []
    ratio = preparation.long_run_event_distance_ratio
    if ratio is None:
        messages.append(
            EventGuidanceMessage(
                tone="neutral",
                title=_localized_text(locale, "add_distance_title"),
                detail=_localized_text(locale, "add_distance_detail"),
            )
        )
    elif ratio >= 0.8:
        messages.append(
            EventGuidanceMessage(
                tone="success",
                title=_localized_text(locale, "long_run_close_title"),
                detail=_localized_text(locale, "long_run_close_detail"),
            )
        )
    else:
        messages.append(
            EventGuidanceMessage(
                tone="warning",
                title=_localized_text(locale, "long_run_gap_title"),
                detail=_localized_text(locale, "long_run_gap_detail"),
            )
        )
    if preparation.missed_planned_sessions > 0:
        messages.append(
            EventGuidanceMessage(
                tone="warning",
                title=_localized_text(locale, "plan_adherence_title"),
                detail=_localized_text(locale, "plan_adherence_detail", count=preparation.missed_planned_sessions),
            )
        )
    if event.priority == "A":
        messages.append(
            EventGuidanceMessage(
                tone="neutral",
                title=_localized_text(locale, "priority_event_title"),
                detail=_localized_text(locale, "priority_event_detail"),
            )
        )
    return messages


def _user_locale(session: Session, user_id: UUID) -> str:
    """Return owner locale for generated event guidance."""
    locale = session.scalar(select(UserPreference.locale).where(UserPreference.user_id == user_id))
    return "en-US" if locale and locale.startswith("en") else "cs-CZ"


def _localized_text(locale: str, key: str, **params: int) -> str:
    """Return localized event guidance text."""
    copy = EVENT_GUIDANCE_COPY["en-US" if locale.startswith("en") else "cs-CZ"][key]
    return copy.format(**params)


EVENT_GUIDANCE_COPY = {
    "cs-CZ": {
        "easy_session_title": "Lehký aerobní běh",
        "easy_session_detail": "Drž konverzační tempo a opakovatelné úsilí.",
        "long_session_title": "Dlouhý běh",
        "long_session_detail": "Buduj vytrvalost bez závodního úsilí.",
        "quality_session_title": "Kontrolovaný kvalitní trénink",
        "quality_session_detail": "Použij kontrolované tempo nebo kratší intervaly podle únavy.",
        "add_distance_title": "Doplň vzdálenost události",
        "add_distance_detail": "Připravenost podle vzdálenosti bude jasnější po nastavení délky události.",
        "long_run_close_title": "Dlouhý běh je blízko",
        "long_run_close_detail": "Tvůj nedávný dlouhý běh už je blízko délce události.",
        "long_run_gap_title": "Mezera v dlouhém běhu",
        "long_run_gap_detail": "Tvůj nedávný dlouhý běh je stále výrazně kratší než délka události.",
        "plan_adherence_title": "Plnění plánu",
        "plan_adherence_detail": "Nedávno bylo vynecháno {count} plánovaných tréninků.",
        "priority_event_title": "Prioritní událost",
        "priority_event_detail": "Poslední týden drž konzervativně, aby událost zůstala hlavním těžkým úsilím.",
        "target_pace_item_label": "Cílové tempo",
        "target_pace_item_detail": "Cílový čas vydělený vzdáleností události.",
        "recent_volume_item_label": "Poslední 4 týdny",
        "recent_volume_item_detail": "Dokončená běžecká vzdálenost a počet běhů za posledních 28 dní.",
        "long_run_item_label": "Dlouhý běh",
        "long_run_item_detail": "Nejdelší běh za posledních 8 týdnů proti vzdálenosti události.",
        "future_plan_item_label": "Plán do události",
        "future_plan_item_detail": "Plánované běžecké tréninky od dneška do dne události.",
        "missed_sessions_item_label": "Vynechané tréninky",
        "missed_sessions_item_detail": "Plánované běžecké tréninky z posledních 28 dní bez dokončeného běhu ve stejný den.",
        "intensity_mix_item_label": "Rozložení intenzity",
        "intensity_mix_item_detail": "Čas běhu za posledních 28 dní podle uložené intenzity aktivit.",
    },
    "en-US": {
        "easy_session_title": "Easy aerobic run",
        "easy_session_detail": "Keep this conversational and repeatable.",
        "long_session_title": "Long run",
        "long_session_detail": "Build endurance without turning it into a race effort.",
        "quality_session_title": "Controlled quality session",
        "quality_session_detail": "Use controlled tempo or short intervals based on fatigue.",
        "add_distance_title": "Add event distance",
        "add_distance_detail": "Distance-based readiness becomes clearer after the event distance is set.",
        "long_run_close_title": "Long run is close",
        "long_run_close_detail": "Your recent long run is already near the event distance.",
        "long_run_gap_title": "Long run gap",
        "long_run_gap_detail": "Your recent long run is still meaningfully shorter than the event distance.",
        "plan_adherence_title": "Plan adherence",
        "plan_adherence_detail": "{count} planned sessions were missed recently.",
        "priority_event_title": "Priority event",
        "priority_event_detail": "Keep the final week conservative so the event remains the main hard effort.",
        "target_pace_item_label": "Target pace",
        "target_pace_item_detail": "Target time divided by event distance.",
        "recent_volume_item_label": "Recent 4 weeks",
        "recent_volume_item_detail": "Completed running distance and run count over the last 28 days.",
        "long_run_item_label": "Long run",
        "long_run_item_detail": "Longest run in the last 8 weeks compared with event distance.",
        "future_plan_item_label": "Plan to event",
        "future_plan_item_detail": "Planned running sessions from today through event day.",
        "missed_sessions_item_label": "Missed sessions",
        "missed_sessions_item_detail": "Planned running sessions from the last 28 days without a same-day completed run.",
        "intensity_mix_item_label": "Intensity mix",
        "intensity_mix_item_detail": "Running time from the last 28 days by stored activity intensity.",
    },
}
