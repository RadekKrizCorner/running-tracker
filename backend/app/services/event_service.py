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
    EventRead,
    EventSuggestedSession,
    EventUpdate,
)
from app.services.analytics_service import RUNNING_TYPES


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
    target_pace = (event.target_time_s / (distance_m / 1000)) if event.target_time_s and distance_m > 0 else None
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


def calculate_event_preparation(session: Session, user: User, event: Event, today: date | None = None) -> EventPreparation:
    """Calculate preparation metrics for one event."""
    current_date = today or local_date(utc_now(), user.timezone)
    four_week_start = current_date - timedelta(days=27)
    eight_week_start = current_date - timedelta(days=55)
    current_activities = _activities_between(session, user, four_week_start, current_date)
    eight_week_activities = _activities_between(session, user, eight_week_start, current_date)
    future_workouts = _planned_workouts_between(session, user.id, current_date, event.event_date)
    missed_workouts = [
        workout
        for workout in _planned_workouts_between(session, user.id, four_week_start, current_date - timedelta(days=1))
        if workout.workout_type != "rest" and workout.completed_activity_id is None and workout.status in {"planned", "skipped"}
    ]
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
    return list(
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
    },
}
