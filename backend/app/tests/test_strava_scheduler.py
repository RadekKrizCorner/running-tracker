from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.crypto import encrypt_secret
from app.db.session import get_session_factory
from app.models import ProviderConnection, User
from app.tests.conftest import setup_and_login


def test_scheduler_queues_recent_sync_for_connected_owner(client, monkeypatch) -> None:
    """Verify the periodic scheduler queues a recent sync for a connected owner."""
    import app.jobs.scheduler as scheduler

    owner_id = _create_strava_connection(client, status="connected")
    queued: list[tuple[str, tuple[str, ...]]] = []

    def fake_active_job(owner_id_arg: str, function_paths: set[str] | frozenset[str] | None = None) -> str | None:
        """Return no active job for the owner."""
        assert owner_id_arg == owner_id
        assert function_paths == scheduler.STRAVA_SYNC_TASKS
        return None

    def fake_enqueue(function_path: str, *args: str) -> str:
        """Record a queued job without touching Redis."""
        queued.append((function_path, args))
        return "job-1"

    monkeypatch.setattr(scheduler, "find_active_owner_job", fake_active_job)
    monkeypatch.setattr(scheduler, "enqueue_task", fake_enqueue)

    with get_session_factory()() as session:
        result = scheduler.enqueue_periodic_strava_syncs(session)

    assert result == {"connected": 1, "queued": 1, "skipped_active": 0, "errors": 0}
    assert queued == [(scheduler.RECENT_SYNC_TASK, (owner_id,))]


def test_scheduler_skips_connected_owner_with_active_sync(client, monkeypatch) -> None:
    """Verify the periodic scheduler does not duplicate active Strava sync jobs."""
    import app.jobs.scheduler as scheduler

    owner_id = _create_strava_connection(client, status="connected")

    def fake_active_job(owner_id_arg: str, function_paths: set[str] | frozenset[str] | None = None) -> str | None:
        """Return an active job for the owner."""
        assert owner_id_arg == owner_id
        assert function_paths == scheduler.STRAVA_SYNC_TASKS
        return "active-job-1"

    def fail_enqueue(function_path: str, *args: str) -> str:
        """Fail if the scheduler tries to queue a duplicate job."""
        raise AssertionError(f"unexpected enqueue for {function_path} {args}")

    monkeypatch.setattr(scheduler, "find_active_owner_job", fake_active_job)
    monkeypatch.setattr(scheduler, "enqueue_task", fail_enqueue)

    with get_session_factory()() as session:
        result = scheduler.enqueue_periodic_strava_syncs(session)

    assert result == {"connected": 1, "queued": 0, "skipped_active": 1, "errors": 0}


def test_scheduler_ignores_disconnected_strava_connection(client, monkeypatch) -> None:
    """Verify the periodic scheduler ignores disconnected Strava connections."""
    import app.jobs.scheduler as scheduler

    _create_strava_connection(client, status="disconnected")

    def fail_active_job(owner_id_arg: str, function_paths: set[str] | frozenset[str] | None = None) -> str | None:
        """Fail if a disconnected owner reaches active job lookup."""
        raise AssertionError(f"unexpected active job lookup for {owner_id_arg} {function_paths}")

    def fail_enqueue(function_path: str, *args: str) -> str:
        """Fail if a disconnected owner reaches enqueue."""
        raise AssertionError(f"unexpected enqueue for {function_path} {args}")

    monkeypatch.setattr(scheduler, "find_active_owner_job", fail_active_job)
    monkeypatch.setattr(scheduler, "enqueue_task", fail_enqueue)

    with get_session_factory()() as session:
        result = scheduler.enqueue_periodic_strava_syncs(session)

    assert result == {"connected": 0, "queued": 0, "skipped_active": 0, "errors": 0}


def test_scheduler_interval_is_capped_to_four_times_daily() -> None:
    """Verify configured intervals cannot reduce auto sync below four runs daily."""
    import app.jobs.scheduler as scheduler

    assert scheduler.scheduler_interval_seconds(10) == 60
    assert scheduler.scheduler_interval_seconds(60 * 60 * 24) == 60 * 60 * 6
    assert scheduler.scheduler_interval_seconds(60 * 30) == 60 * 30


def _create_strava_connection(client, status: str) -> str:
    """Create an owner Strava connection and return the owner id."""
    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status=status,
                provider_user_id="strava-owner",
                scopes_granted=["read", "activity:read_all"],
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()
        return str(owner.id)
