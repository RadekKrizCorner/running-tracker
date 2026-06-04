from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GearBase(BaseModel):
    """Represent shared gear fields."""

    type: str = "shoe"
    name: str
    brand: str | None = None
    model: str | None = None
    start_date: date | None = None
    retirement_distance_m: float = 700000
    retired_at: date | None = None
    notes: str | None = None


class GearCreate(GearBase):
    """Represent gear creation input."""


class GearUpdate(BaseModel):
    """Represent gear update input."""

    type: str | None = None
    name: str | None = None
    brand: str | None = None
    model: str | None = None
    start_date: date | None = None
    retirement_distance_m: float | None = Field(default=None, ge=1)
    retired_at: date | None = None
    notes: str | None = None


class GearRead(GearBase):
    """Represent gear output."""

    id: UUID
    total_distance_m: float = 0
    retirement_warning: bool = False

    model_config = ConfigDict(from_attributes=True)

