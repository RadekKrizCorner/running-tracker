from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TrainingPlanRead(BaseModel):
    """Represent a training plan."""

    id: UUID | None = None
    title: str
    goal_type: str | None = None
    start_date: date
    end_date: date
    status: str = "draft"

    model_config = ConfigDict(from_attributes=True)


class PlannedWorkoutBase(BaseModel):
    """Represent shared planned workout fields."""

    plan_id: UUID | None = None
    scheduled_date: date
    session_label: str | None = None
    sort_order: int = 0
    workout_type: str
    title: str
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None
    completed_activity_id: UUID | None = None
    status: str = "planned"


class PlannedWorkoutCreate(PlannedWorkoutBase):
    """Represent planned workout creation input."""


class PlannedWorkoutUpdate(BaseModel):
    """Represent planned workout update input."""

    scheduled_date: date | None = None
    session_label: str | None = None
    sort_order: int | None = None
    workout_type: str | None = None
    title: str | None = None
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None
    completed_activity_id: UUID | None = None
    status: str | None = None


class PlannedWorkoutRead(PlannedWorkoutBase):
    """Represent planned workout output."""

    id: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class CalendarEventBase(BaseModel):
    """Represent shared calendar event fields."""

    event_date: date
    event_type: str = "event"
    title: str
    notes: str | None = None


class CalendarEventCreate(CalendarEventBase):
    """Represent calendar event creation input."""


class CalendarEventUpdate(BaseModel):
    """Represent calendar event update input."""

    event_date: date | None = None
    event_type: str | None = None
    title: str | None = None
    notes: str | None = None


class CalendarEventRead(CalendarEventBase):
    """Represent calendar event output."""

    id: UUID
    source_type: str = "custom"
    source_id: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkoutTemplateBase(BaseModel):
    """Represent reusable workout template fields."""

    name: str
    workout_type: str
    title: str
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None


class WorkoutTemplateCreate(WorkoutTemplateBase):
    """Represent workout template creation input."""


class WorkoutTemplateUpdate(BaseModel):
    """Represent workout template update input."""

    name: str | None = None
    workout_type: str | None = None
    title: str | None = None
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None


class WorkoutTemplateRead(WorkoutTemplateBase):
    """Represent workout template output."""

    id: UUID

    model_config = ConfigDict(from_attributes=True)


class WeekScheduleWorkout(BaseModel):
    """Represent one workout entry in a manual weekly schedule."""

    scheduled_date: date
    template_id: UUID | None = None
    session_label: str | None = None
    sort_order: int | None = None
    workout_type: str | None = None
    title: str | None = None
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None
    status: str = "planned"


class WeekScheduleRequest(BaseModel):
    """Represent a full manual weekly schedule replacement."""

    week_start_date: date
    plan_title: str | None = None
    workouts: list[WeekScheduleWorkout] = Field(default_factory=list)


class WeekCopyRequest(BaseModel):
    """Represent a request to copy one week into another week."""

    source_week_start_date: date
    target_week_start_date: date
    plan_title: str | None = None


class WorkoutPoolItemBase(BaseModel):
    """Represent shared workout pool item fields."""

    source_template_id: UUID | None = None
    workout_type: str
    title: str
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None


class WorkoutPoolItemCreate(WorkoutPoolItemBase):
    """Represent workout pool item creation input."""


class WorkoutPoolItemUpdate(BaseModel):
    """Represent workout pool item update input."""

    source_template_id: UUID | None = None
    workout_type: str | None = None
    title: str | None = None
    target_duration_s: int | None = None
    target_distance_m: float | None = None
    target_intensity: str | None = None
    instructions: str | None = None


class WorkoutPoolItemRead(WorkoutPoolItemBase):
    """Represent workout pool item output."""

    id: UUID

    model_config = ConfigDict(from_attributes=True)


class SchedulePoolItemRequest(BaseModel):
    """Represent scheduling an unscheduled workout pool item."""

    scheduled_date: date
    plan_id: UUID | None = None
    session_label: str | None = None
    sort_order: int | None = None
    status: str = "planned"


class PlanGenerateRequest(BaseModel):
    """Represent plan generation input."""

    goal_type: str
    start_date: date
    end_date: date | None = None
    weeks: int | None = Field(default=8, ge=1, le=30)
    current_weekly_distance_m: float = Field(default=0, ge=0)
    current_runs_per_week: int = Field(default=3, ge=1, le=7)
    preferred_run_days: list[int] = Field(default_factory=lambda: [1, 3, 6])
    long_run_day: int = 6
    experience_level: str = "beginner"
    injury_risk: str = "low"


class PlanPreview(BaseModel):
    """Represent a generated plan preview."""

    plan: TrainingPlanRead
    workouts: list[PlannedWorkoutRead]


class CalendarResponse(BaseModel):
    """Represent calendar data."""

    plan: TrainingPlanRead | None = None
    planned_workouts: list[PlannedWorkoutRead]
    activities: list[dict]
    events: list[CalendarEventRead] = Field(default_factory=list)
