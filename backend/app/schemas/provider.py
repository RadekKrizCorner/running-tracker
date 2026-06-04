from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SyncProgress(BaseModel):
    """Represent safe background sync progress."""

    phase: str
    imported: int = 0
    skipped: int = 0
    streams: int = 0
    current_activity: str | None = None
    started_at: str | None = None
    updated_at: str | None = None


class StravaStatusResponse(BaseModel):
    """Represent Strava connection status."""

    connected: bool
    status: str
    provider_user_id: str | None = None
    scopes_granted: list[str] = []
    missing_scopes: list[str] = []
    access_token_expires_at: datetime | None = None
    last_sync_at: datetime | None = None
    last_error: str | None = None
    active_job_id: str | None = None


class SyncRequest(BaseModel):
    """Represent a manual sync request."""

    mode: str = "recent"
    after_date: str | None = None
    before_date: str | None = None


class SyncResponse(BaseModel):
    """Represent queued sync status."""

    status: str
    job_id: str | None = None
    detail: str


class SyncJobStatusResponse(BaseModel):
    """Represent background sync job status."""

    job_id: str
    status: str
    detail: str
    result: dict | None = None
    error: str | None = None
    progress: SyncProgress | None = None
