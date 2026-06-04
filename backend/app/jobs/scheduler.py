from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import get_session_factory
from app.jobs.queue import STRAVA_SYNC_TASKS, enqueue_task, find_active_owner_job
from app.models import ProviderConnection
from app.services.demo_data_service import refresh_demo_account

logger = logging.getLogger(__name__)

RECENT_SYNC_TASK = "app.jobs.tasks.strava_sync_recent_task"
MIN_SCHEDULER_INTERVAL_SECONDS = 60
MAX_SCHEDULER_INTERVAL_SECONDS = 60 * 60 * 6
_last_demo_refresh_at: datetime | None = None


class SchedulerTickResult(TypedDict):
    """Represent one periodic scheduler tick result."""

    connected: int
    queued: int
    skipped_active: int
    errors: int


def main() -> None:
    """Run the periodic Strava sync scheduler loop."""
    configure_logging()
    settings = get_settings()
    if not settings.strava_auto_sync_enabled and not settings.demo_refresh_enabled:
        logger.info("Periodic scheduler is disabled")
        return

    interval = scheduler_interval_seconds(settings.strava_auto_sync_interval_seconds)
    logger.info("Starting periodic Strava sync scheduler", extra={"interval_seconds": interval})
    try:
        while True:
            if settings.strava_auto_sync_enabled:
                result = run_periodic_strava_sync_once()
                logger.info("Periodic Strava sync scheduler tick completed", extra=dict(result))
            if settings.demo_refresh_enabled:
                refreshed = run_periodic_demo_refresh_once()
                logger.info("Periodic demo refresh tick completed", extra={"refreshed": refreshed})
            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("Periodic Strava sync scheduler stopped")


def run_periodic_strava_sync_once() -> SchedulerTickResult:
    """Open a database session and enqueue due Strava sync jobs once."""
    with get_session_factory()() as session:
        return enqueue_periodic_strava_syncs(session)


def scheduler_interval_seconds(configured_interval_seconds: int) -> int:
    """Return a safe interval that runs automatic sync at least 4 times daily."""
    return min(
        max(configured_interval_seconds, MIN_SCHEDULER_INTERVAL_SECONDS),
        MAX_SCHEDULER_INTERVAL_SECONDS,
    )


def run_periodic_demo_refresh_once(now: datetime | None = None) -> bool:
    """Refresh demo data once when the configured interval has elapsed."""
    global _last_demo_refresh_at
    settings = get_settings()
    if not settings.demo_account_enabled or not settings.demo_refresh_enabled:
        return False
    current_time = now or datetime.now(UTC)
    interval = max(settings.demo_refresh_interval_seconds, MIN_SCHEDULER_INTERVAL_SECONDS)
    if _last_demo_refresh_at is not None and (current_time - _last_demo_refresh_at).total_seconds() < interval:
        return False
    try:
        with get_session_factory()() as session:
            refresh_demo_account(session, settings)
        _last_demo_refresh_at = current_time
        return True
    except Exception:
        logger.exception("Periodic demo refresh failed")
        return False


def enqueue_periodic_strava_syncs(session: Session) -> SchedulerTickResult:
    """Enqueue recent Strava syncs for connected owners without active sync jobs."""
    result: SchedulerTickResult = {
        "connected": 0,
        "queued": 0,
        "skipped_active": 0,
        "errors": 0,
    }
    connections = list(
        session.scalars(
            select(ProviderConnection).where(
                ProviderConnection.provider == "strava",
                ProviderConnection.status == "connected",
                ProviderConnection.access_token_encrypted.is_not(None),
                ProviderConnection.refresh_token_encrypted.is_not(None),
            )
        )
    )
    result["connected"] = len(connections)

    for connection in connections:
        owner_id = str(connection.user_id)
        try:
            active_job_id = find_active_owner_job(owner_id, STRAVA_SYNC_TASKS)
            if active_job_id is not None:
                result["skipped_active"] += 1
                continue
            enqueue_task(RECENT_SYNC_TASK, owner_id)
            result["queued"] += 1
        except Exception:
            logger.exception("Periodic Strava sync enqueue failed", extra={"owner_id": owner_id})
            result["errors"] += 1
    return result


if __name__ == "__main__":
    main()
