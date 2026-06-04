from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    """Represent one in-app notification."""

    id: UUID
    type: str
    title: str
    body: str
    action_url: str | None = None
    action_label: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    read_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationSummary(BaseModel):
    """Represent notification counters for the owner."""

    unread_count: int
