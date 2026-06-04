from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models import PlannedWorkout, TrainingPlan, User, WorkoutPoolItem, WorkoutTemplate
from app.schemas.planning import (
    PlanGenerateRequest,
    PlanPreview,
    PlannedWorkoutCreate,
    PlannedWorkoutRead,
    SchedulePoolItemRequest,
    TrainingPlanRead,
    WeekCopyRequest,
    WeekScheduleRequest,
    WeekScheduleWorkout,
    WorkoutPoolItemCreate,
    WorkoutPoolItemUpdate,
    WorkoutTemplateCreate,
    WorkoutTemplateUpdate,
)

DEFAULT_WORKOUT_TEMPLATES = [
    {
        "name": "Easy run",
        "workout_type": "easy",
        "title": "Easy run",
        "target_duration_s": 2700,
        "target_distance_m": 7000,
        "target_intensity": "easy",
        "instructions": "Run at conversational pace.",
    },
    {
        "name": "Long run",
        "workout_type": "long",
        "title": "Long run",
        "target_duration_s": 5400,
        "target_distance_m": 14000,
        "target_intensity": "easy",
        "instructions": "Keep the effort relaxed and controlled.",
    },
    {
        "name": "Recovery run",
        "workout_type": "recovery",
        "title": "Recovery run",
        "target_duration_s": 1800,
        "target_distance_m": 4500,
        "target_intensity": "easy",
        "instructions": "Keep this deliberately very easy.",
    },
    {
        "name": "Tempo beginner",
        "workout_type": "tempo",
        "title": "Tempo beginner",
        "target_duration_s": 3000,
        "target_distance_m": 8000,
        "target_intensity": "hard",
        "instructions": "10 min easy, 3 x 6 min comfortably hard with 2 min easy, 10 min easy.",
    },
    {
        "name": "Intervals beginner",
        "workout_type": "intervals",
        "title": "Intervals beginner",
        "target_duration_s": 3000,
        "target_distance_m": 7500,
        "target_intensity": "hard",
        "instructions": "10 min easy, 6 x 2 min hard with 2 min easy, 10 min easy.",
    },
    {
        "name": "Strength",
        "workout_type": "strength",
        "title": "Strength",
        "target_duration_s": 2400,
        "target_distance_m": None,
        "target_intensity": "moderate",
        "instructions": "General strength and core work.",
    },
    {
        "name": "Rest",
        "workout_type": "rest",
        "title": "Rest",
        "target_duration_s": None,
        "target_distance_m": None,
        "target_intensity": "rest",
        "instructions": "No running.",
    },
]


def generate_plan_preview(request: PlanGenerateRequest) -> PlanPreview:
    """Generate a conservative rule-based training plan preview."""
    weeks = _plan_weeks(request)
    end_date = request.end_date or (request.start_date + timedelta(weeks=weeks, days=-1))
    title = _goal_title(request.goal_type)
    plan = TrainingPlanRead(
        title=title,
        goal_type=request.goal_type,
        start_date=request.start_date,
        end_date=end_date,
        status="draft",
    )
    run_days = _preferred_days(request)
    workouts: list[PlannedWorkoutRead] = []
    base_distance = max(request.current_weekly_distance_m, 9000 if request.goal_type != "start_running" else 3000)
    progression = 1.04 if request.injury_risk == "low" else 1.02
    for week_index in range(weeks):
        deload = (week_index + 1) % 4 == 0
        week_distance = base_distance * (progression**week_index) * (0.75 if deload else 1.0)
        day_distances = _weekly_distribution(week_distance, len(run_days), request.long_run_day in run_days)
        for day_index, weekday in enumerate(run_days):
            scheduled = request.start_date + timedelta(days=(week_index * 7) + ((weekday - request.start_date.weekday()) % 7))
            if scheduled > end_date:
                continue
            workout = _build_workout(request, scheduled, weekday, week_index, deload, day_distances[day_index])
            workouts.append(workout)
    return PlanPreview(plan=plan, workouts=workouts)


def create_generated_plan(session: Session, user: User, request: PlanGenerateRequest) -> PlanPreview:
    """Persist a generated plan and its workouts."""
    preview = generate_plan_preview(request)
    plan = TrainingPlan(
        user_id=user.id,
        title=preview.plan.title,
        goal_type=preview.plan.goal_type,
        start_date=preview.plan.start_date,
        end_date=preview.plan.end_date,
        status="draft",
    )
    session.add(plan)
    session.flush()
    created_workouts: list[PlannedWorkoutRead] = []
    for workout in preview.workouts:
        row = PlannedWorkout(
            user_id=user.id,
            plan_id=plan.id,
            scheduled_date=workout.scheduled_date,
            session_label=workout.session_label,
            sort_order=workout.sort_order,
            workout_type=workout.workout_type,
            title=workout.title,
            target_duration_s=workout.target_duration_s,
            target_distance_m=workout.target_distance_m,
            target_intensity=workout.target_intensity,
            instructions=workout.instructions,
            status=workout.status,
        )
        session.add(row)
        session.flush()
        created_workouts.append(PlannedWorkoutRead.model_validate(row))
    session.commit()
    session.refresh(plan)
    return PlanPreview(plan=TrainingPlanRead.model_validate(plan), workouts=created_workouts)


def ensure_default_workout_templates(session: Session, user: User) -> None:
    """Ensure the owner has default reusable workout templates."""
    existing_names = set(
        session.scalars(select(WorkoutTemplate.name).where(WorkoutTemplate.user_id == user.id)).all()
    )
    created = False
    for template in DEFAULT_WORKOUT_TEMPLATES:
        if template["name"] in existing_names:
            continue
        session.add(WorkoutTemplate(user_id=user.id, **template))
        created = True
    if created:
        session.commit()


def list_workout_templates(session: Session, user: User) -> list[WorkoutTemplate]:
    """Return owner workout templates, creating defaults if needed."""
    ensure_default_workout_templates(session, user)
    return list(
        session.scalars(
            select(WorkoutTemplate).where(WorkoutTemplate.user_id == user.id).order_by(WorkoutTemplate.name)
        )
    )


def create_workout_template(session: Session, user: User, payload: WorkoutTemplateCreate) -> WorkoutTemplate:
    """Create a reusable workout template."""
    existing = session.scalar(
        select(WorkoutTemplate).where(WorkoutTemplate.user_id == user.id, WorkoutTemplate.name == payload.name)
    )
    if existing is not None:
        raise AppException(409, "WORKOUT_TEMPLATE_EXISTS", "A workout template with this name already exists")
    template = WorkoutTemplate(user_id=user.id, **payload.model_dump())
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def get_workout_template_for_user(session: Session, user_id: UUID, template_id: UUID) -> WorkoutTemplate:
    """Return a workout template scoped to a user."""
    template = session.scalar(
        select(WorkoutTemplate).where(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == user_id)
    )
    if template is None:
        raise AppException(404, "WORKOUT_TEMPLATE_NOT_FOUND", "Workout template was not found")
    return template


def update_workout_template(
    session: Session,
    user: User,
    template_id: UUID,
    payload: WorkoutTemplateUpdate,
) -> WorkoutTemplate:
    """Update a reusable workout template."""
    template = get_workout_template_for_user(session, user.id, template_id)
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        existing = session.scalar(
            select(WorkoutTemplate).where(
                WorkoutTemplate.user_id == user.id,
                WorkoutTemplate.name == updates["name"],
                WorkoutTemplate.id != template.id,
            )
        )
        if existing is not None:
            raise AppException(409, "WORKOUT_TEMPLATE_EXISTS", "A workout template with this name already exists")
    for key, value in updates.items():
        setattr(template, key, value)
    session.commit()
    session.refresh(template)
    return template


def delete_workout_template(session: Session, user: User, template_id: UUID) -> None:
    """Delete a reusable workout template."""
    template = get_workout_template_for_user(session, user.id, template_id)
    session.delete(template)
    session.commit()


def replace_week_schedule(session: Session, user: User, request: WeekScheduleRequest) -> list[PlannedWorkout]:
    """Replace non-completed planned workouts in one owner week."""
    week_start = request.week_start_date
    week_end = week_start + timedelta(days=6)
    for entry in request.workouts:
        if entry.scheduled_date < week_start or entry.scheduled_date > week_end:
            raise AppException(400, "VALIDATION_ERROR", "Weekly schedule entries must stay inside the selected week")
    plan = _manual_week_plan(session, user, week_start, week_end, request.plan_title)
    resolved_entries = _resolved_week_schedule_entries(session, user, request.workouts)
    session.execute(
        delete(PlannedWorkout).where(
            PlannedWorkout.user_id == user.id,
            PlannedWorkout.scheduled_date >= week_start,
            PlannedWorkout.scheduled_date <= week_end,
            PlannedWorkout.status != "completed",
        )
    )
    created: list[PlannedWorkout] = []
    for entry, workout_data in resolved_entries:
        workout = PlannedWorkout(
            user_id=user.id,
            plan_id=plan.id if plan is not None else None,
            scheduled_date=entry.scheduled_date,
            **workout_data,
        )
        session.add(workout)
        created.append(workout)
    session.commit()
    for workout in created:
        session.refresh(workout)
    return created


def copy_week_schedule(session: Session, user: User, request: WeekCopyRequest) -> list[PlannedWorkout]:
    """Copy one owner week of planned workouts into another week."""
    source_start = request.source_week_start_date
    source_end = source_start + timedelta(days=6)
    target_start = request.target_week_start_date
    source_workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user.id,
                PlannedWorkout.scheduled_date >= source_start,
                PlannedWorkout.scheduled_date <= source_end,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    source_workouts = deduplicate_planned_workouts_by_session(source_workouts)
    copied_entries = [
        WeekScheduleWorkout(
            scheduled_date=target_start + timedelta(days=(workout.scheduled_date - source_start).days),
            session_label=workout.session_label,
            sort_order=workout.sort_order,
            workout_type=workout.workout_type,
            title=workout.title,
            target_duration_s=workout.target_duration_s,
            target_distance_m=float(workout.target_distance_m) if workout.target_distance_m is not None else None,
            target_intensity=workout.target_intensity,
            instructions=workout.instructions,
            status="planned",
        )
        for workout in source_workouts
    ]
    return replace_week_schedule(
        session,
        user,
        WeekScheduleRequest(
            week_start_date=target_start,
            plan_title=request.plan_title,
            workouts=copied_entries,
        ),
    )


def list_workout_pool_items(session: Session, user: User) -> list[WorkoutPoolItem]:
    """Return owner unscheduled workout pool items."""
    return list(
        session.scalars(
            select(WorkoutPoolItem)
            .where(WorkoutPoolItem.user_id == user.id)
            .order_by(WorkoutPoolItem.created_at.desc())
        )
    )


def create_workout_pool_item(session: Session, user: User, payload: WorkoutPoolItemCreate) -> WorkoutPoolItem:
    """Create an unscheduled workout pool item."""
    if payload.source_template_id is not None:
        get_workout_template_for_user(session, user.id, payload.source_template_id)
    data = _pool_payload_data(payload.model_dump())
    item = WorkoutPoolItem(user_id=user.id, **data)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def get_workout_pool_item_for_user(session: Session, user_id: UUID, pool_item_id: UUID) -> WorkoutPoolItem:
    """Return one owner workout pool item."""
    item = session.scalar(
        select(WorkoutPoolItem).where(WorkoutPoolItem.id == pool_item_id, WorkoutPoolItem.user_id == user_id)
    )
    if item is None:
        raise AppException(404, "WORKOUT_POOL_ITEM_NOT_FOUND", "Workout pool item was not found")
    return item


def update_workout_pool_item(
    session: Session,
    user: User,
    pool_item_id: UUID,
    payload: WorkoutPoolItemUpdate,
) -> WorkoutPoolItem:
    """Update an unscheduled workout pool item."""
    item = get_workout_pool_item_for_user(session, user.id, pool_item_id)
    if payload.source_template_id is not None:
        get_workout_template_for_user(session, user.id, payload.source_template_id)
    updates = _pool_payload_data(payload.model_dump(exclude_unset=True))
    for key, value in updates.items():
        setattr(item, key, value)
    session.commit()
    session.refresh(item)
    return item


def delete_workout_pool_item(session: Session, user: User, pool_item_id: UUID) -> None:
    """Delete an unscheduled workout pool item."""
    item = get_workout_pool_item_for_user(session, user.id, pool_item_id)
    session.delete(item)
    session.commit()


def schedule_workout_pool_item(
    session: Session,
    user: User,
    pool_item_id: UUID,
    payload: SchedulePoolItemRequest,
) -> PlannedWorkout:
    """Schedule a workout pool item and remove it from the pool."""
    item = get_workout_pool_item_for_user(session, user.id, pool_item_id)
    if payload.plan_id is not None:
        plan = session.scalar(select(TrainingPlan).where(TrainingPlan.id == payload.plan_id, TrainingPlan.user_id == user.id))
        if plan is None:
            raise AppException(404, "PLAN_NOT_FOUND", "Plan was not found")
    validate_rest_day_conflict(
        session,
        user.id,
        payload.scheduled_date,
        item.workout_type,
    )
    workout = PlannedWorkout(
        user_id=user.id,
        plan_id=payload.plan_id,
        scheduled_date=payload.scheduled_date,
        session_label=_normalized_session_label(payload.session_label),
        sort_order=payload.sort_order or 0,
        workout_type=item.workout_type,
        title=item.title,
        target_duration_s=item.target_duration_s,
        target_distance_m=item.target_distance_m,
        target_intensity=item.target_intensity,
        instructions=item.instructions,
        status=payload.status,
    )
    session.add(workout)
    session.delete(item)
    session.commit()
    session.refresh(workout)
    return workout


def deduplicate_planned_workouts_by_session(workouts: list[PlannedWorkout]) -> list[PlannedWorkout]:
    """Return one planned workout per date, label, and order slot."""
    latest_by_session: dict[tuple[date, str, int], PlannedWorkout] = {}
    for workout in sorted(workouts, key=_planned_workout_latest_key):
        latest_by_session[_planned_workout_session_key(workout)] = workout
    return sorted(latest_by_session.values(), key=_planned_workout_sort_key)


def deduplicate_planned_workouts_by_date(workouts: list[PlannedWorkout]) -> list[PlannedWorkout]:
    """Return one planned workout per legacy unlabeled date slot."""
    return deduplicate_planned_workouts_by_session(workouts)


def validate_rest_day_conflict(
    session: Session,
    user_id: UUID,
    scheduled_date: date,
    workout_type: str,
    ignored_workout_id: UUID | None = None,
) -> None:
    """Reject planned workouts that mix rest and non-rest sessions on one day."""
    existing = list(
        session.scalars(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date == scheduled_date,
                PlannedWorkout.status != "cancelled",
            )
        )
    )
    if ignored_workout_id is not None:
        existing = [workout for workout in existing if workout.id != ignored_workout_id]
    if not existing:
        return
    has_rest = any(workout.workout_type == "rest" for workout in existing)
    has_workout = any(workout.workout_type != "rest" for workout in existing)
    if (workout_type == "rest" and has_workout) or (workout_type != "rest" and has_rest):
        raise AppException(400, "REST_DAY_CONFLICT", "Rest days cannot contain planned workout sessions")


def _manual_week_plan(
    session: Session,
    user: User,
    week_start: date,
    week_end: date,
    plan_title: str | None,
) -> TrainingPlan | None:
    """Create or update the manual training plan for a week."""
    title = plan_title.strip() if plan_title else ""
    if not title:
        return None
    plan = session.scalar(
        select(TrainingPlan).where(
            TrainingPlan.user_id == user.id,
            TrainingPlan.goal_type == "manual_week",
            TrainingPlan.start_date == week_start,
            TrainingPlan.end_date == week_end,
        )
    )
    if plan is None:
        plan = TrainingPlan(
            user_id=user.id,
            goal_type="manual_week",
            start_date=week_start,
            end_date=week_end,
            status="active",
            title=title,
        )
        session.add(plan)
        session.flush()
    else:
        plan.title = title
        plan.status = "active"
        session.flush()
    return plan


def get_workout_for_user(session: Session, user_id: UUID, workout_id: UUID) -> PlannedWorkout:
    """Return a planned workout scoped to a user."""
    workout = session.scalar(select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.user_id == user_id))
    if workout is None:
        raise AppException(404, "PLANNED_WORKOUT_NOT_FOUND", "Planned workout was not found")
    return workout


def _resolved_week_schedule_entries(
    session: Session,
    user: User,
    workouts: list[WeekScheduleWorkout],
) -> list[tuple[WeekScheduleWorkout, dict]]:
    """Return validated weekly entries with normalized sort order and data."""
    next_order_by_date: defaultdict[date, int] = defaultdict(int)
    resolved: list[tuple[WeekScheduleWorkout, dict]] = []
    for entry in _coalesced_legacy_week_schedule_entries(workouts):
        sort_order = entry.sort_order
        if sort_order is None:
            sort_order = next_order_by_date[entry.scheduled_date]
        next_order_by_date[entry.scheduled_date] = max(next_order_by_date[entry.scheduled_date], sort_order + 1)
        normalized_entry = entry.model_copy(update={"sort_order": sort_order})
        workout_data = _workout_data_from_entry(session, user, normalized_entry)
        if workout_data is not None:
            resolved.append((normalized_entry, workout_data))
    _validate_resolved_week_rest_conflicts(resolved)
    return sorted(resolved, key=lambda item: (item[0].scheduled_date, item[0].sort_order or 0))


def _coalesced_legacy_week_schedule_entries(workouts: list[WeekScheduleWorkout]) -> list[WeekScheduleWorkout]:
    """Return entries with legacy unlabeled same-day duplicates collapsed."""
    coalesced: list[WeekScheduleWorkout] = []
    legacy_index_by_date: dict[date, int] = {}
    for workout in workouts:
        is_legacy_unlabeled = workout.session_label is None and workout.sort_order is None
        if not is_legacy_unlabeled:
            coalesced.append(workout)
            continue
        existing_index = legacy_index_by_date.get(workout.scheduled_date)
        if existing_index is None:
            legacy_index_by_date[workout.scheduled_date] = len(coalesced)
            coalesced.append(workout)
        else:
            coalesced[existing_index] = workout
    return coalesced


def _validate_resolved_week_rest_conflicts(resolved_entries: list[tuple[WeekScheduleWorkout, dict]]) -> None:
    """Reject weekly entries that mix rest and workout sessions on one date."""
    types_by_date: defaultdict[date, set[str]] = defaultdict(set)
    for entry, workout_data in resolved_entries:
        types_by_date[entry.scheduled_date].add(workout_data["workout_type"])
    for workout_types in types_by_date.values():
        if "rest" in workout_types and any(workout_type != "rest" for workout_type in workout_types):
            raise AppException(400, "REST_DAY_CONFLICT", "Rest days cannot contain planned workout sessions")


def _planned_workout_sort_key(workout: PlannedWorkout) -> tuple[date, int, datetime, str]:
    """Return a stable display sort key for planned workouts."""
    created_at = workout.created_at or datetime.min
    return (workout.scheduled_date, workout.sort_order, created_at, str(workout.id))


def _planned_workout_latest_key(workout: PlannedWorkout) -> tuple[date, str, int, datetime, datetime, str]:
    """Return a stable latest-row sort key for planned workouts."""
    created_at = workout.created_at or datetime.min
    updated_at = workout.updated_at or created_at
    session_label = _normalized_session_label(workout.session_label) or ""
    return (workout.scheduled_date, session_label.casefold(), workout.sort_order, updated_at, created_at, str(workout.id))


def _planned_workout_session_key(workout: PlannedWorkout) -> tuple[date, str, int]:
    """Return the logical session identity for planned workout deduplication."""
    session_label = _normalized_session_label(workout.session_label) or ""
    return (workout.scheduled_date, session_label.casefold(), workout.sort_order)


def _workout_data_from_entry(session: Session, user: User, entry: WeekScheduleWorkout) -> dict | None:
    """Build planned workout fields from a weekly entry."""
    data: dict = {}
    if entry.template_id is not None:
        template = get_workout_template_for_user(session, user.id, entry.template_id)
        data.update(
            {
                "workout_type": template.workout_type,
                "title": template.title,
                "target_duration_s": template.target_duration_s,
                "target_distance_m": template.target_distance_m,
                "target_intensity": template.target_intensity,
                "instructions": template.instructions,
            }
        )
    overrides = entry.model_dump(exclude={"scheduled_date", "template_id"}, exclude_none=True)
    data.update(overrides)
    if "session_label" in data:
        data["session_label"] = _normalized_session_label(data["session_label"])
    if not data.get("title") and not data.get("workout_type"):
        return None
    if not data.get("title") or not data.get("workout_type"):
        raise AppException(400, "VALIDATION_ERROR", "Scheduled workouts need both title and workout type")
    if data.get("target_distance_m") is not None:
        data["target_distance_m"] = Decimal(str(data["target_distance_m"]))
    data["status"] = data.get("status") or "planned"
    return data


def _normalized_session_label(value: str | None) -> str | None:
    """Return a trimmed session label or None."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _pool_payload_data(data: dict) -> dict:
    """Normalize workout pool payload data for storage."""
    if data.get("target_distance_m") is not None:
        data["target_distance_m"] = Decimal(str(data["target_distance_m"]))
    return data


def apply_workout_update(workout: PlannedWorkout, payload: dict) -> PlannedWorkout:
    """Apply editable planned workout fields."""
    if "session_label" in payload:
        payload["session_label"] = _normalized_session_label(payload["session_label"])
    for key, value in payload.items():
        setattr(workout, key, value)
    return workout


def _plan_weeks(request: PlanGenerateRequest) -> int:
    """Return the number of weeks to generate."""
    if request.end_date is not None:
        return max(((request.end_date - request.start_date).days + 1) // 7, 1)
    return request.weeks or 8


def _goal_title(goal_type: str) -> str:
    """Return a human-readable plan title."""
    titles = {
        "general_fitness": "General fitness plan",
        "start_running": "Start running plan",
        "five_k": "5K beginner plan",
        "ten_k": "10K basic plan",
        "half_marathon": "Half marathon plan",
    }
    return titles.get(goal_type, "Running plan")


def _preferred_days(request: PlanGenerateRequest) -> list[int]:
    """Return a safe list of preferred run days."""
    days = sorted(set(day for day in request.preferred_run_days if 0 <= day <= 6))
    max_runs = min(max(request.current_runs_per_week, 3), 5 if request.experience_level != "beginner" else 3)
    return days[:max_runs] or [1, 3, request.long_run_day]


def _weekly_distribution(total_distance_m: float, run_count: int, has_long_run: bool) -> list[float]:
    """Split weekly distance across runs."""
    if run_count <= 1:
        return [total_distance_m]
    long_share = 0.38 if has_long_run else 0.30
    easy_share = (1.0 - long_share) / (run_count - 1)
    distances = [total_distance_m * easy_share for _ in range(run_count)]
    distances[-1] = total_distance_m * long_share
    return distances


def _build_workout(
    request: PlanGenerateRequest,
    scheduled: date,
    weekday: int,
    week_index: int,
    deload: bool,
    distance_m: float,
) -> PlannedWorkoutRead:
    """Build one planned workout for the generated plan."""
    is_long = weekday == request.long_run_day
    quality_allowed = request.experience_level in {"regular", "advanced_hobby"} and request.injury_risk == "low"
    quality_day = quality_allowed and not deload and week_index % 2 == 1 and not is_long
    if deload:
        title = "Deload easy run"
        workout_type = "easy"
        intensity = "easy"
        instructions = "Keep this run relaxed and shorter than usual."
    elif is_long:
        title = "Long run"
        workout_type = "long"
        intensity = "easy"
        instructions = "Run conversationally and keep the effort controlled."
    elif quality_day:
        title = "Tempo beginner"
        workout_type = "tempo"
        intensity = "hard"
        instructions = "10 min easy, 3 x 6 min comfortably hard with 2 min easy, 10 min easy."
    else:
        title = "Easy run"
        workout_type = "easy"
        intensity = "easy"
        instructions = "Run at conversational pace."
    if request.goal_type == "start_running":
        title = "Run/walk easy"
        workout_type = "easy"
        intensity = "easy"
        instructions = "Alternate easy running and walking. Stop while it still feels controlled."
    return PlannedWorkoutRead(
        scheduled_date=scheduled,
        workout_type=workout_type,
        title=title,
        target_duration_s=int(max(distance_m / 2.4, 1200)),
        target_distance_m=round(distance_m, 2),
        target_intensity=intensity,
        instructions=instructions,
        status="planned",
    )
