from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

POSTER_IMAGE_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
)
POSTER_IMAGE_MAX_BYTES = 3_000_000
POSTER_IMAGE_MAX_BASE64_LENGTH = ((POSTER_IMAGE_MAX_BYTES + 2) // 3) * 4
POSTER_IMAGE_MAX_LENGTH = (
    max(len(prefix) for prefix in POSTER_IMAGE_PREFIXES) + POSTER_IMAGE_MAX_BASE64_LENGTH
)


def validate_poster_image_data(value: str | None) -> str | None:
    """Validate optional poster image data URLs."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > POSTER_IMAGE_MAX_LENGTH:
        raise ValueError("poster image is too large")
    if not cleaned.lower().startswith(POSTER_IMAGE_PREFIXES):
        raise ValueError("poster image must be a PNG, JPEG, WebP, or GIF data URL")
    return cleaned


class EventPreparation(BaseModel):
    """Represent calculated preparation metrics for an event."""

    phase: str
    current_4w_distance_m: float
    current_4w_load: float
    longest_run_8w_m: float
    long_run_event_distance_ratio: float | None = None
    planned_distance_to_event_m: float
    planned_load_to_event: float
    planned_sessions_to_event: int
    completed_runs_since_created: int
    completed_distance_since_created_m: float
    completed_load_since_created: float
    missed_planned_sessions: int
    easy_time_s: int
    moderate_time_s: int
    hard_time_s: int


class EventBase(BaseModel):
    """Represent shared event fields."""

    name: str = Field(min_length=1, max_length=255)
    event_date: date
    location: str | None = None
    event_type: str
    distance_m: float | None = Field(default=None, ge=0)
    elevation_gain_m: float | None = Field(default=None, ge=0)
    surface: str | None = None
    priority: str | None = None
    status: str = "planned"
    target_time_s: int | None = Field(default=None, ge=1)
    website_url: str | None = None
    course_map_url: str | None = None
    course_gpx: str | None = None
    poster_image_data: str | None = Field(default=None, max_length=POSTER_IMAGE_MAX_LENGTH)
    goal_notes: str | None = None
    course_notes: str | None = None
    fueling_notes: str | None = None
    gear_notes: str | None = None
    travel_notes: str | None = None

    @field_validator("poster_image_data")
    @classmethod
    def validate_event_poster_image(cls, value: str | None) -> str | None:
        """Validate event poster image input."""
        return validate_poster_image_data(value)


class EventCreate(EventBase):
    """Represent event creation input."""


class EventUpdate(BaseModel):
    """Represent editable event fields."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    event_date: date | None = None
    location: str | None = None
    event_type: str | None = None
    distance_m: float | None = Field(default=None, ge=0)
    elevation_gain_m: float | None = Field(default=None, ge=0)
    surface: str | None = None
    priority: str | None = None
    status: str | None = None
    target_time_s: int | None = Field(default=None, ge=1)
    website_url: str | None = None
    course_map_url: str | None = None
    course_gpx: str | None = None
    poster_image_data: str | None = Field(default=None, max_length=POSTER_IMAGE_MAX_LENGTH)
    goal_notes: str | None = None
    course_notes: str | None = None
    fueling_notes: str | None = None
    gear_notes: str | None = None
    travel_notes: str | None = None

    @field_validator("poster_image_data")
    @classmethod
    def validate_event_poster_image(cls, value: str | None) -> str | None:
        """Validate event poster image update input."""
        return validate_poster_image_data(value)


class EventRead(EventBase):
    """Represent event output with calculated fields."""

    id: UUID
    days_until_start: int
    weeks_until_start: float
    target_pace_s_per_km: float | None = None
    preparation: EventPreparation

    model_config = ConfigDict(from_attributes=True)


class EventGuidanceMessage(BaseModel):
    """Represent one event preparation guidance message."""

    tone: str
    title: str
    detail: str


class EventReadinessIntensityMix(BaseModel):
    """Represent recent event readiness intensity seconds."""

    easy_time_s: int
    moderate_time_s: int
    hard_time_s: int
    unknown_time_s: int


class EventReadinessItem(BaseModel):
    """Represent one transparent readiness metric item."""

    key: str
    label: str
    value: str
    detail: str
    status: Literal["good", "watch", "missing", "neutral"]


class EventReadiness(BaseModel):
    """Represent event readiness metrics and guidance."""

    event_id: UUID
    phase: str
    days_until_start: int
    target_pace_s_per_km: float | None = None
    recent_4w_distance_m: float
    recent_4w_load: float
    recent_4w_run_count: int
    longest_run_8w_m: float
    long_run_event_distance_ratio: float | None = None
    planned_distance_to_event_m: float
    planned_load_to_event: float
    planned_sessions_to_event: int
    missed_planned_sessions: int
    intensity_mix: EventReadinessIntensityMix
    readiness_items: list[EventReadinessItem]
    guidance_messages: list[EventGuidanceMessage]


class EventSuggestedSession(BaseModel):
    """Represent one suggested weekly session for event preparation."""

    workout_type: str
    title: str
    target_intensity: str
    target_distance_m: float | None = None
    target_duration_s: int | None = None
    detail: str


class EventPlanningGuidance(BaseModel):
    """Represent transparent planning guidance for an event."""

    event_id: UUID
    phase: str
    weeks_until_start: float
    suggested_weekly_distance_m: float
    suggested_long_run_m: float | None = None
    suggested_sessions: list[EventSuggestedSession]
    messages: list[EventGuidanceMessage]
