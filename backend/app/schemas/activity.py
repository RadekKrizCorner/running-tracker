from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GearMini(BaseModel):
    """Represent gear attached to an activity."""

    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class ActivityNoteRead(BaseModel):
    """Represent activity notes."""

    rpe: int | None = None
    fatigue: int | None = None
    soreness: int | None = None
    pain_flag: bool = False
    pain_location: str | None = None
    sleep_quality: int | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ActivityNoteWrite(BaseModel):
    """Represent activity note changes."""

    rpe: int | None = Field(default=None, ge=1, le=10)
    fatigue: int | None = Field(default=None, ge=1, le=5)
    soreness: int | None = Field(default=None, ge=1, le=5)
    pain_flag: bool = False
    pain_location: str | None = None
    sleep_quality: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class HeartRateZoneBreakdownRead(BaseModel):
    """Represent activity time spent in one heart-rate zone."""

    zone_index: int
    name: str
    min_hr: int
    max_hr: int
    seconds: int
    sample_count: int
    percentage: float


class ActivityRead(BaseModel):
    """Represent an activity response."""

    id: UUID
    provider: str
    provider_activity_id: str | None = None
    sport_type: str | None = None
    workout_type: str | None = None
    name: str | None = None
    description: str | None = None
    start_time_utc: datetime
    start_time_local: datetime | None = None
    timezone: str | None = None
    distance_m: float | None = None
    moving_time_s: int | None = None
    elapsed_time_s: int | None = None
    elevation_gain_m: float | None = None
    average_speed_mps: float | None = None
    max_speed_mps: float | None = None
    average_hr: float | None = None
    max_hr: float | None = None
    average_cadence: float | None = None
    calories: float | None = None
    perceived_effort: float | None = None
    computed_load: float | None = None
    load_source: str | None = None
    intensity_class: str | None = None
    elevation_gain_source: str | None = None
    heart_rate_zone_breakdown: list[HeartRateZoneBreakdownRead] = Field(default_factory=list)
    map_polyline: str | None = None
    gear: list[GearMini] = []
    note: ActivityNoteRead | None = None

    model_config = ConfigDict(from_attributes=True)


class ActivityUpdate(BaseModel):
    """Represent user-editable activity fields."""

    workout_type: str | None = None
    perceived_effort: float | None = Field(default=None, ge=1, le=10)
    intensity_class: str | None = None
    description: str | None = None


class StreamRead(BaseModel):
    """Represent one activity stream."""

    stream_type: str
    data: list | dict
    sample_count: int | None = None

    model_config = ConfigDict(from_attributes=True)
