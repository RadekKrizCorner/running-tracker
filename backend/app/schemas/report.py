from __future__ import annotations

from datetime import date, datetime
import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ReportJson = dict[str, Any]
REPORT_RENDER_VALUES_MAX_BYTES = 64_000
REPORT_RENDER_TEMPLATE_MAX_BYTES = 64_000


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

    @model_validator(mode="after")
    def validate_render_payload_size(self) -> "ReportRenderRequest":
        """Validate that render payloads stay within bounded size limits."""
        if _json_size_bytes(self.values) > REPORT_RENDER_VALUES_MAX_BYTES:
            raise ValueError("report values payload is too large")
        if self.template is not None and _json_size_bytes(self.template) > REPORT_RENDER_TEMPLATE_MAX_BYTES:
            raise ValueError("report template payload is too large")
        return self


def _json_size_bytes(value: object) -> int:
    """Return compact JSON size in bytes for a render payload value."""
    return len(json.dumps(value, default=str, separators=(",", ":")).encode("utf-8"))
