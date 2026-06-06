from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ReportJson = dict[str, Any]


class ReportTemplateBase(BaseModel):
    """Represent shared report template fields."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    format: str = "instagram_story"
    theme: ReportJson = Field(default_factory=dict)
    sections: list[ReportJson] = Field(default_factory=list)
    field_defaults: ReportJson = Field(default_factory=dict)
    is_default: bool = False


class ReportTemplateCreate(ReportTemplateBase):
    """Represent report template creation input."""


class ReportTemplateUpdate(BaseModel):
    """Represent report template update input."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    format: str | None = None
    theme: ReportJson | None = None
    sections: list[ReportJson] | None = None
    field_defaults: ReportJson | None = None
    is_default: bool | None = None


class ReportTemplateRead(ReportTemplateBase):
    """Represent report template output."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GeneratedReportCreate(BaseModel):
    """Represent saved report creation input."""

    template_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    period_start: date
    period_end: date
    values: ReportJson = Field(default_factory=dict)


class GeneratedReportUpdate(BaseModel):
    """Represent saved report update input."""

    template_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    period_start: date | None = None
    period_end: date | None = None
    values: ReportJson | None = None


class GeneratedReportRead(BaseModel):
    """Represent saved report output."""

    id: UUID
    template_id: UUID | None = None
    title: str
    period_start: date
    period_end: date
    values: ReportJson
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportPrefillRequest(BaseModel):
    """Represent weekly report prefill input."""

    week_start_date: date
    template_id: UUID | None = None


class ReportPrefillResponse(BaseModel):
    """Represent report prefill output."""

    template_id: UUID | None = None
    period_start: date
    period_end: date
    values: ReportJson


class ReportRenderRequest(BaseModel):
    """Represent report render input."""

    values: ReportJson = Field(default_factory=dict)
    template: ReportJson | None = None
