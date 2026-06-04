from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, WritableUser
from app.core.exceptions import AppException
from app.core.time import end_of_day, local_date, start_of_day
from app.models import Activity, CalendarEvent, Event, PlannedWorkout, TrainingPlan
from app.schemas.planning import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarResponse,
    PlanGenerateRequest,
    PlanPreview,
    PlannedWorkoutCreate,
    PlannedWorkoutRead,
    PlannedWorkoutUpdate,
    SchedulePoolItemRequest,
    TrainingPlanRead,
    WeekCopyRequest,
    WeekScheduleRequest,
    WorkoutPoolItemCreate,
    WorkoutPoolItemRead,
    WorkoutPoolItemUpdate,
    WorkoutTemplateCreate,
    WorkoutTemplateRead,
    WorkoutTemplateUpdate,
)
from app.services.planning_service import (
    apply_workout_update,
    copy_week_schedule,
    create_generated_plan,
    create_workout_pool_item,
    create_workout_template,
    deduplicate_planned_workouts_by_session,
    delete_workout_pool_item,
    delete_workout_template,
    get_workout_pool_item_for_user,
    get_workout_for_user,
    list_workout_pool_items,
    list_workout_templates,
    replace_week_schedule,
    schedule_workout_pool_item,
    update_workout_pool_item,
    update_workout_template,
    validate_rest_day_conflict,
)

router = APIRouter(tags=["planning"])


@router.get("/calendar", response_model=CalendarResponse)
def calendar(session: DbSession, user: CurrentUser, start_date: date, end_date: date) -> CalendarResponse:
    """Return planned and completed workouts for a range."""
    return _calendar_response(session, user, start_date, end_date)


@router.post("/calendar/week", response_model=CalendarResponse)
def replace_calendar_week(payload: WeekScheduleRequest, session: DbSession, user: WritableUser) -> CalendarResponse:
    """Replace one week of owner planned workouts."""
    replace_week_schedule(session, user, payload)
    return _calendar_response(session, user, payload.week_start_date, payload.week_start_date + timedelta(days=6))


@router.post("/calendar/week/copy", response_model=CalendarResponse)
def copy_calendar_week(payload: WeekCopyRequest, session: DbSession, user: WritableUser) -> CalendarResponse:
    """Copy one owner week into another week."""
    copy_week_schedule(session, user, payload)
    return _calendar_response(session, user, payload.target_week_start_date, payload.target_week_start_date + timedelta(days=6))


@router.post("/calendar/events", response_model=CalendarEventRead)
def create_calendar_event(payload: CalendarEventCreate, session: DbSession, user: WritableUser) -> CalendarEventRead:
    """Create a custom owner calendar event."""
    event = CalendarEvent(user_id=user.id, **payload.model_dump())
    session.add(event)
    session.commit()
    session.refresh(event)
    return CalendarEventRead.model_validate(event)


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventRead)
def update_calendar_event(
    event_id: UUID,
    payload: CalendarEventUpdate,
    session: DbSession,
    user: WritableUser,
) -> CalendarEventRead:
    """Update a custom owner calendar event."""
    event = _get_calendar_event_for_user(session, user.id, event_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.commit()
    session.refresh(event)
    return CalendarEventRead.model_validate(event)


@router.delete("/calendar/events/{event_id}", status_code=204)
def delete_calendar_event(event_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete a custom owner calendar event."""
    event = _get_calendar_event_for_user(session, user.id, event_id)
    session.delete(event)
    session.commit()
    return Response(status_code=204)


@router.get("/workout-templates", response_model=list[WorkoutTemplateRead])
def get_workout_templates(session: DbSession, user: CurrentUser) -> list[WorkoutTemplateRead]:
    """Return reusable workout templates."""
    return [WorkoutTemplateRead.model_validate(template) for template in list_workout_templates(session, user)]


@router.post("/workout-templates", response_model=WorkoutTemplateRead)
def post_workout_template(
    payload: WorkoutTemplateCreate,
    session: DbSession,
    user: WritableUser,
) -> WorkoutTemplateRead:
    """Create a reusable workout template."""
    return WorkoutTemplateRead.model_validate(create_workout_template(session, user, payload))


@router.patch("/workout-templates/{template_id}", response_model=WorkoutTemplateRead)
def patch_workout_template(
    template_id: UUID,
    payload: WorkoutTemplateUpdate,
    session: DbSession,
    user: WritableUser,
) -> WorkoutTemplateRead:
    """Update a reusable workout template."""
    return WorkoutTemplateRead.model_validate(update_workout_template(session, user, template_id, payload))


@router.delete("/workout-templates/{template_id}", status_code=204)
def remove_workout_template(template_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete a reusable workout template."""
    delete_workout_template(session, user, template_id)
    return Response(status_code=204)


@router.get("/workout-pool", response_model=list[WorkoutPoolItemRead])
def get_workout_pool(session: DbSession, user: CurrentUser) -> list[WorkoutPoolItemRead]:
    """Return owner unscheduled workout pool items."""
    return [WorkoutPoolItemRead.model_validate(item) for item in list_workout_pool_items(session, user)]


@router.post("/workout-pool", response_model=WorkoutPoolItemRead)
def post_workout_pool_item(
    payload: WorkoutPoolItemCreate,
    session: DbSession,
    user: WritableUser,
) -> WorkoutPoolItemRead:
    """Create an unscheduled workout pool item."""
    return WorkoutPoolItemRead.model_validate(create_workout_pool_item(session, user, payload))


@router.get("/workout-pool/{pool_item_id}", response_model=WorkoutPoolItemRead)
def get_workout_pool_item(pool_item_id: UUID, session: DbSession, user: CurrentUser) -> WorkoutPoolItemRead:
    """Return one owner workout pool item."""
    return WorkoutPoolItemRead.model_validate(get_workout_pool_item_for_user(session, user.id, pool_item_id))


@router.patch("/workout-pool/{pool_item_id}", response_model=WorkoutPoolItemRead)
def patch_workout_pool_item(
    pool_item_id: UUID,
    payload: WorkoutPoolItemUpdate,
    session: DbSession,
    user: WritableUser,
) -> WorkoutPoolItemRead:
    """Update one owner workout pool item."""
    return WorkoutPoolItemRead.model_validate(update_workout_pool_item(session, user, pool_item_id, payload))


@router.delete("/workout-pool/{pool_item_id}", status_code=204)
def remove_workout_pool_item(pool_item_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete one owner workout pool item."""
    delete_workout_pool_item(session, user, pool_item_id)
    return Response(status_code=204)


@router.post("/workout-pool/{pool_item_id}/schedule", response_model=PlannedWorkoutRead)
def schedule_pool_item(
    pool_item_id: UUID,
    payload: SchedulePoolItemRequest,
    session: DbSession,
    user: WritableUser,
) -> PlannedWorkoutRead:
    """Schedule one owner workout pool item."""
    return PlannedWorkoutRead.model_validate(schedule_workout_pool_item(session, user, pool_item_id, payload))


def _calendar_response(session: DbSession, user: CurrentUser, start_date: date, end_date: date) -> CalendarResponse:
    """Build planned and completed workouts for a date range."""
    workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user.id,
                PlannedWorkout.scheduled_date >= start_date,
                PlannedWorkout.scheduled_date <= end_date,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    workouts = deduplicate_planned_workouts_by_session(workouts)
    activities = list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user.id,
                Activity.start_time_utc >= start_of_day(start_date, user.timezone),
                Activity.start_time_utc <= end_of_day(end_date, user.timezone),
            )
            .order_by(Activity.start_time_utc)
        )
    )
    plan = session.scalar(
        select(TrainingPlan).where(
            TrainingPlan.user_id == user.id,
            TrainingPlan.goal_type == "manual_week",
            TrainingPlan.start_date == start_date,
            TrainingPlan.end_date == end_date,
        )
    )
    events = list(
        session.scalars(
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user.id,
                CalendarEvent.event_date >= start_date,
                CalendarEvent.event_date <= end_date,
            )
            .order_by(CalendarEvent.event_date)
        )
    )
    goal_events = list(
        session.scalars(
            select(Event)
            .where(
                Event.user_id == user.id,
                Event.event_date >= start_date,
                Event.event_date <= end_date,
            )
            .order_by(Event.event_date)
        )
    )
    return CalendarResponse(
        plan=TrainingPlanRead.model_validate(plan) if plan is not None else None,
        planned_workouts=[PlannedWorkoutRead.model_validate(workout) for workout in workouts],
        activities=[_calendar_activity(activity, user.timezone) for activity in activities],
        events=[_calendar_custom_event(event) for event in events] + [_calendar_goal_event(event) for event in goal_events],
    )


def _calendar_activity(activity: Activity, timezone: str) -> dict:
    """Convert an activity to a calendar response item."""
    return {
        "id": str(activity.id),
        "name": activity.name,
        "date": local_date(activity.start_time_utc, timezone).isoformat(),
        "distance_m": float(activity.distance_m or 0),
        "moving_time_s": activity.moving_time_s or 0,
        "intensity_class": activity.intensity_class,
    }


def _calendar_custom_event(event: CalendarEvent) -> CalendarEventRead:
    """Convert a custom calendar event to response output."""
    return CalendarEventRead(
        id=event.id,
        event_date=event.event_date,
        event_type=event.event_type,
        title=event.title,
        notes=event.notes,
        source_type="custom",
        source_id=None,
    )


def _calendar_goal_event(event: Event) -> CalendarEventRead:
    """Convert a goal event to calendar response output."""
    return CalendarEventRead(
        id=event.id,
        event_date=event.event_date,
        event_type=event.event_type,
        title=event.name,
        notes=event.goal_notes,
        source_type="event",
        source_id=event.id,
    )


def _get_calendar_event_for_user(session: DbSession, user_id: UUID, event_id: UUID) -> CalendarEvent:
    """Return a custom calendar event scoped to an owner."""
    event = session.scalar(select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == user_id))
    if event is None:
        raise AppException(404, "CALENDAR_EVENT_NOT_FOUND", "Calendar event was not found")
    return event


def _validate_planned_workout_references(session: DbSession, user: CurrentUser, payload: dict) -> None:
    """Validate referenced plan and completed activity belong to the owner."""
    plan_id = payload.get("plan_id")
    if plan_id is not None:
        plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.user_id == user.id))
        if plan is None:
            raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    activity_id = payload.get("completed_activity_id")
    if activity_id is not None:
        activity = session.scalar(select(Activity).where(Activity.id == activity_id, Activity.user_id == user.id))
        if activity is None:
            raise AppException(404, "ACTIVITY_NOT_FOUND", "Activity was not found")


@router.post("/planned-workouts", response_model=PlannedWorkoutRead)
def create_workout(payload: PlannedWorkoutCreate, session: DbSession, user: WritableUser) -> PlannedWorkoutRead:
    """Create a planned workout."""
    data = payload.model_dump()
    _validate_planned_workout_references(session, user, data)
    validate_rest_day_conflict(session, user.id, data["scheduled_date"], data["workout_type"])
    workout = PlannedWorkout(user_id=user.id, **data)
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return PlannedWorkoutRead.model_validate(workout)


@router.get("/planned-workouts/{workout_id}", response_model=PlannedWorkoutRead)
def get_workout(workout_id: UUID, session: DbSession, user: CurrentUser) -> PlannedWorkoutRead:
    """Return one planned workout."""
    return PlannedWorkoutRead.model_validate(get_workout_for_user(session, user.id, workout_id))


@router.patch("/planned-workouts/{workout_id}", response_model=PlannedWorkoutRead)
def update_workout(workout_id: UUID, payload: PlannedWorkoutUpdate, session: DbSession, user: WritableUser) -> PlannedWorkoutRead:
    """Update a planned workout."""
    workout = get_workout_for_user(session, user.id, workout_id)
    updates = payload.model_dump(exclude_unset=True)
    _validate_planned_workout_references(session, user, updates)
    next_date = updates.get("scheduled_date", workout.scheduled_date)
    next_type = updates.get("workout_type", workout.workout_type)
    validate_rest_day_conflict(session, user.id, next_date, next_type, workout.id)
    apply_workout_update(workout, updates)
    session.commit()
    session.refresh(workout)
    return PlannedWorkoutRead.model_validate(workout)


@router.delete("/planned-workouts/{workout_id}", status_code=204)
def delete_workout(workout_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete a planned workout."""
    workout = get_workout_for_user(session, user.id, workout_id)
    session.delete(workout)
    session.commit()
    return Response(status_code=204)


@router.post("/plans/generate", response_model=PlanPreview)
def generate_plan(payload: PlanGenerateRequest, session: DbSession, user: WritableUser) -> PlanPreview:
    """Generate and persist a draft plan."""
    return create_generated_plan(session, user, payload)


@router.get("/plans", response_model=list[TrainingPlanRead])
def list_plans(session: DbSession, user: CurrentUser) -> list[TrainingPlanRead]:
    """List owner plans."""
    plans = session.scalars(select(TrainingPlan).where(TrainingPlan.user_id == user.id).order_by(TrainingPlan.created_at.desc())).all()
    return [TrainingPlanRead.model_validate(plan) for plan in plans]


@router.get("/plans/{plan_id}", response_model=PlanPreview)
def get_plan(plan_id: UUID, session: DbSession, user: CurrentUser) -> PlanPreview:
    """Return one plan with workouts."""
    plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.user_id == user.id))
    if plan is None:
        raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    workouts = session.scalars(
        select(PlannedWorkout)
        .where(PlannedWorkout.plan_id == plan.id)
        .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
    ).all()
    return PlanPreview(plan=TrainingPlanRead.model_validate(plan), workouts=[PlannedWorkoutRead.model_validate(workout) for workout in workouts])


@router.patch("/plans/{plan_id}", response_model=TrainingPlanRead)
def update_plan(plan_id: UUID, payload: dict, session: DbSession, user: WritableUser) -> TrainingPlanRead:
    """Update editable plan fields."""
    plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.user_id == user.id))
    if plan is None:
        raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    for key in {"title", "status", "end_date"}:
        if key in payload:
            setattr(plan, key, payload[key])
    session.commit()
    session.refresh(plan)
    return TrainingPlanRead.model_validate(plan)


@router.post("/plans/{plan_id}/activate", response_model=TrainingPlanRead)
def activate_plan(plan_id: UUID, session: DbSession, user: WritableUser) -> TrainingPlanRead:
    """Activate a plan."""
    plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.user_id == user.id))
    if plan is None:
        raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    plan.status = "active"
    session.commit()
    session.refresh(plan)
    return TrainingPlanRead.model_validate(plan)


@router.post("/plans/{plan_id}/archive", response_model=TrainingPlanRead)
def archive_plan(plan_id: UUID, session: DbSession, user: WritableUser) -> TrainingPlanRead:
    """Archive a plan."""
    plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.user_id == user.id))
    if plan is None:
        raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    plan.status = "archived"
    session.commit()
    session.refresh(plan)
    return TrainingPlanRead.model_validate(plan)
