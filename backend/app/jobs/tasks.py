from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.db.session import get_session_factory
from app.jobs.queue import update_current_job_progress
from app.providers.strava.sync import strava_sync_history, strava_sync_recent


def strava_sync_recent_task(owner_id: str) -> dict[str, int]:
    """Run the recent Strava sync task."""
    with get_session_factory()() as session:
        return strava_sync_recent(session, UUID(owner_id), progress=_record_progress)


def strava_sync_history_task(owner_id: str, after_date: str | None = None, before_date: str | None = None) -> dict[str, int]:
    """Run the historical Strava sync task."""
    after = datetime.fromisoformat(after_date) if after_date else None
    before = datetime.fromisoformat(before_date) if before_date else None
    with get_session_factory()() as session:
        return strava_sync_history(session, UUID(owner_id), after, before, progress=_record_progress)


def recompute_owner_aggregates(owner_id: str) -> None:
    """Recompute owner aggregates from a background task."""
    from app.services.analytics_service import recompute_owner_weekly_metrics

    with get_session_factory()() as session:
        recompute_owner_weekly_metrics(session, UUID(owner_id))


def _record_progress(progress: dict) -> None:
    """Record sync progress on the active RQ job."""
    update_current_job_progress(progress)
