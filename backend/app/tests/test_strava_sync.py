from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_strava_sync_status_endpoint_returns_job_state(client, monkeypatch) -> None:
    """Verify owner can poll a queued Strava sync job status."""
    import app.api.routes.connections_strava as connections_route

    setup_and_login(client)

    def fake_job_status(job_id: str, owner_id: str | None = None) -> dict:
        """Return a deterministic fake job status."""
        assert owner_id is not None
        return {
            "job_id": job_id,
            "status": "started",
            "detail": "Strava sync is running",
            "result": None,
            "error": None,
            "progress": {
                "phase": "importing",
                "imported": 2,
                "skipped": 1,
                "streams": 4,
                "current_activity": "Morning run",
                "started_at": "2026-05-05T06:00:00Z",
                "updated_at": "2026-05-05T06:01:00Z",
            },
        }

    monkeypatch.setattr(connections_route, "get_job_status", fake_job_status)

    response = client.get("/api/v1/connections/strava/sync/job-123")

    assert response.status_code == 200
    assert response.json() == {
        "job_id": "job-123",
        "status": "started",
        "detail": "Strava sync is running",
        "result": None,
        "error": None,
        "progress": {
            "phase": "importing",
            "imported": 2,
            "skipped": 1,
            "streams": 4,
            "current_activity": "Morning run",
            "started_at": "2026-05-05T06:00:00Z",
            "updated_at": "2026-05-05T06:01:00Z",
        },
    }


def test_strava_status_returns_active_sync_job_id(client, monkeypatch) -> None:
    """Verify Strava status exposes an active sync job for dashboard resume."""
    import app.api.routes.connections_strava as connections_route
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

    def fake_active_job(owner_id: str, function_paths: set[str] | None = None) -> str | None:
        """Return a deterministic active sync job id."""
        assert owner_id
        assert function_paths is not None
        return "active-job-1"

    monkeypatch.setattr(connections_route, "find_active_owner_job", fake_active_job)

    response = client.get("/api/v1/connections/strava/status")

    assert response.status_code == 200
    assert response.json()["active_job_id"] == "active-job-1"


def test_job_status_includes_sanitized_progress(monkeypatch) -> None:
    """Verify RQ job progress is whitelisted before returning to clients."""
    import app.jobs.queue as queue_module

    class FakeJob:
        """Represent an RQ job with sensitive extra metadata."""

        id = "job-1"
        args = ("owner-1",)
        result = None
        exc_info = None
        meta = {
            "progress": {
                "phase": "importing",
                "imported": 4,
                "skipped": 2,
                "streams": 7,
                "current_activity": "Lunch run",
                "started_at": "2026-05-05T06:00:00Z",
                "updated_at": "2026-05-05T06:03:00Z",
                "access_token": "secret-token",
                "latlng": [[50.1, 14.4]],
            }
        }

        def get_status(self, refresh: bool = False) -> str:
            """Return a running status."""
            assert refresh is True
            return "started"

    class FakeQueue:
        """Represent the minimal queue object used by status lookup."""

        connection = object()

    def fake_queue() -> FakeQueue:
        """Return a fake RQ queue."""
        return FakeQueue()

    def fake_fetch(job_id: str, connection: object) -> FakeJob:
        """Return a fake RQ job."""
        assert job_id == "job-1"
        assert connection is not None
        return FakeJob()

    monkeypatch.setattr(queue_module, "get_queue", fake_queue)
    monkeypatch.setattr(queue_module.Job, "fetch", fake_fetch)

    status = queue_module.get_job_status("job-1", "owner-1")

    assert status["progress"] == {
        "phase": "importing",
        "imported": 4,
        "skipped": 2,
        "streams": 7,
        "current_activity": "Lunch run",
        "started_at": "2026-05-05T06:00:00Z",
        "updated_at": "2026-05-05T06:03:00Z",
    }


def test_strava_sync_history_reports_progress(client, monkeypatch) -> None:
    """Verify sync reports phase and counts through the progress callback."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    class ProgressStravaClient:
        """Provide one running activity for progress reporting tests."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return one running activity summary."""
            _ = after, before
            return [
                {
                    "id": 456,
                    "sport_type": "Run",
                    "type": "Run",
                    "name": "Progress run",
                    "start_date": "2026-05-05T06:00:00Z",
                    "distance": 5000,
                    "moving_time": 1800,
                }
            ]

        def fetch_activity_details(self, activity_id: str) -> dict:
            """Return activity details."""
            assert activity_id == "456"
            return {"id": 456, "sport_type": "Run", "name": "Progress detail"}

        def fetch_activity_streams(self, activity_id: str) -> dict:
            """Return one stream."""
            assert activity_id == "456"
            return {"heartrate": {"data": [130, 132]}}

    monkeypatch.setattr(sync_module, "StravaClient", ProgressStravaClient)
    progress_events: list[dict] = []

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        result = sync_module.strava_sync_history(session, owner.id, progress=progress_events.append)

    assert result == {"imported": 1, "skipped": 0, "streams": 1}
    assert progress_events[0]["phase"] == "fetching"
    assert any(event["phase"] == "importing" and event["current_activity"] == "Progress run" for event in progress_events)
    assert progress_events[-1]["phase"] == "finished"
    assert progress_events[-1]["imported"] == 1


def test_strava_sync_endpoint_reuses_active_owner_job(client, monkeypatch) -> None:
    """Verify sync requests reuse an existing active owner job."""
    import app.api.routes.connections_strava as connections_route
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

    def fake_active_job(owner_id: str, function_paths: set[str] | None = None) -> str | None:
        """Return an existing active job id for the owner."""
        assert function_paths is not None
        assert owner_id
        return "existing-job-123"

    def fail_enqueue(function_path: str, *args) -> str:
        """Fail if the endpoint tries to enqueue a duplicate job."""
        raise AssertionError(f"unexpected enqueue for {function_path} {args}")

    monkeypatch.setattr(connections_route, "find_active_owner_job", fake_active_job, raising=False)
    monkeypatch.setattr(connections_route, "enqueue_task", fail_enqueue)

    response = client.post("/api/v1/connections/strava/sync", json={"mode": "recent"})

    assert response.status_code == 200
    assert response.json() == {
        "status": "queued",
        "job_id": "existing-job-123",
        "detail": "Strava sync already queued or running",
    }


def test_strava_sync_fetches_details_and_streams_idempotently(client, monkeypatch) -> None:
    """Verify Strava sync imports details and updates activity streams without duplicates."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, ProviderConnection, User

    class FakeStravaClient:
        """Provide deterministic Strava API responses for sync tests."""

        detail_name = "Detailed morning run"
        heartrate = [120, 126, 132]

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return one running activity summary."""
            _ = after, before
            return [
                {
                    "id": 123,
                    "sport_type": "Run",
                    "type": "Run",
                    "name": "Summary run",
                    "start_date": "2026-04-27T06:00:00Z",
                    "start_date_local": "2026-04-27T08:00:00Z",
                    "distance": 5000,
                    "moving_time": 1800,
                }
            ]

        def fetch_activity_details(self, activity_id: str) -> dict:
            """Return detailed activity fields."""
            assert activity_id == "123"
            return {
                "id": 123,
                "sport_type": "Run",
                "name": self.detail_name,
                "description": "Imported detail payload",
                "start_date": "2026-04-27T06:00:00Z",
                "start_date_local": "2026-04-27T08:00:00Z",
                "distance": 5100,
                "moving_time": 1860,
                "average_heartrate": 138,
                "map": {"summary_polyline": "abc"},
            }

        def fetch_activity_streams(self, activity_id: str) -> dict:
            """Return keyed activity streams."""
            assert activity_id == "123"
            return {
                "time": {"data": [0, 60, 120]},
                "distance": {"data": [0, 250, 500]},
                "heartrate": {"data": self.heartrate},
            }

    monkeypatch.setattr(sync_module, "StravaClient", FakeStravaClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        result = sync_module.strava_sync_history(session, owner.id)
        assert result == {"imported": 1, "skipped": 0, "streams": 3}

        FakeStravaClient.detail_name = "Updated detailed run"
        FakeStravaClient.heartrate = [122, 128, 134]
        second_result = sync_module.strava_sync_history(session, owner.id)
        assert second_result == {"imported": 1, "skipped": 0, "streams": 3}

        activities = list(session.scalars(select(Activity).where(Activity.provider == "strava")))
        assert len(activities) == 1
        assert activities[0].name == "Updated detailed run"
        assert activities[0].description == "Imported detail payload"
        assert activities[0].map_polyline == "abc"

        streams = list(session.scalars(select(ActivityStream).where(ActivityStream.activity_id == activities[0].id)))
        assert {stream.stream_type for stream in streams} == {"time", "distance", "heartrate"}
        assert len(streams) == 3
        heartrate = next(stream for stream in streams if stream.stream_type == "heartrate")
        assert heartrate.data == [122, 128, 134]


def test_strava_sync_corrects_zero_elevation_when_profile_setting_enabled(client, monkeypatch) -> None:
    """Verify Strava sync can correct broken zero elevation from GPS streams."""
    import app.services.elevation_service as elevation_service
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, ProviderConnection, User, UserPreference

    class ElevationStravaClient:
        """Provide one running activity with zero provider elevation and GPS streams."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return one running activity summary."""
            _ = after, before
            return [
                {
                    "id": 654,
                    "sport_type": "Run",
                    "type": "Run",
                    "name": "Zero elevation run",
                    "start_date": "2026-05-04T06:00:00Z",
                    "start_date_local": "2026-05-04T08:00:00Z",
                    "distance": 5000,
                    "moving_time": 1800,
                    "total_elevation_gain": 0,
                }
            ]

        def fetch_activity_details(self, activity_id: str) -> dict:
            """Return detailed activity fields."""
            assert activity_id == "654"
            return {
                "id": 654,
                "sport_type": "Run",
                "name": "Zero elevation run",
                "start_date": "2026-05-04T06:00:00Z",
                "start_date_local": "2026-05-04T08:00:00Z",
                "distance": 5000,
                "moving_time": 1800,
                "total_elevation_gain": 0,
            }

        def fetch_activity_streams(self, activity_id: str) -> dict:
            """Return keyed activity streams including GPS track."""
            assert activity_id == "654"
            return {
                "latlng": {"data": [[50.0, 14.0], [50.001, 14.001], [50.002, 14.002]]},
                "altitude": {"data": [0, 0, 0]},
            }

    class FakeElevationClient:
        """Return deterministic DEM elevations for sync correction."""

        def __init__(self, provider_url: str) -> None:
            """Create a fake elevation client."""
            assert provider_url == "https://elevation.example.test/lookup"

        def lookup_elevations(self, points: list[tuple[float, float]]) -> list[float]:
            """Return elevations matching GPS points."""
            assert points == [(50.0, 14.0), (50.001, 14.001), (50.002, 14.002)]
            return [100.0, 104.0, 106.0]

    monkeypatch.setattr(sync_module, "StravaClient", ElevationStravaClient)
    monkeypatch.setattr(elevation_service, "ElevationClient", FakeElevationClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.add(
            UserPreference(
                user_id=owner.id,
                locale="cs-CZ",
                dashboard_mode="advanced",
                favorite_template_ids=[],
                recent_template_ids=[],
                pace_zones=[],
                elevation_correction_enabled=True,
                elevation_correction_mode="only_when_zero",
                elevation_provider_url="https://elevation.example.test/lookup",
            )
        )
        session.commit()

        result = sync_module.strava_sync_history(session, owner.id)

        assert result == {"imported": 1, "skipped": 0, "streams": 2}
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "654"))
        assert activity is not None
        assert float(activity.elevation_gain_m or 0) == 6.0
        assert activity.elevation_gain_source == "dem_corrected"
        corrected = session.scalar(
            select(ActivityStream).where(
                ActivityStream.activity_id == activity.id,
                ActivityStream.stream_type == "elevation_corrected",
            )
        )
        assert corrected is not None
        assert corrected.data == [100.0, 104.0, 106.0]


def test_strava_recent_without_existing_import_uses_history_window(client, monkeypatch) -> None:
    """Verify first recent sync looks back 24 months when no Strava data exists."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    requested_after: list[datetime] = []

    class EmptyStravaClient:
        """Record the requested activity window without returning activities."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return no activities and keep the after timestamp."""
            _ = before
            requested_after.append(after)
            return []

    monkeypatch.setattr(sync_module, "StravaClient", EmptyStravaClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        result = sync_module.strava_sync_recent(session, owner.id)

        assert result == {"imported": 0, "skipped": 0, "streams": 0}
        assert len(requested_after) == 1
        assert requested_after[0] is not None
        days_back = datetime.now(UTC) - requested_after[0]
        assert timedelta(days=729) <= days_back <= timedelta(days=731)


def test_strava_recent_with_partial_history_backfills_history_window(client, monkeypatch) -> None:
    """Verify recent sync backfills when existing Strava history is only partial."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import Activity, ProviderConnection, User

    requested_after: list[datetime] = []

    class EmptyStravaClient:
        """Record the requested activity window without returning activities."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return no activities and keep the after timestamp."""
            _ = before
            requested_after.append(after)
            return []

    monkeypatch.setattr(sync_module, "StravaClient", EmptyStravaClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            ProviderConnection(
                user_id=owner.id,
                provider="strava",
                status="connected",
                access_token_encrypted=encrypt_secret("access-token"),
                refresh_token_encrypted=encrypt_secret("refresh-token"),
                access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.add(
            Activity(
                user_id=owner.id,
                provider="strava",
                provider_activity_id="recent-only",
                sport_type="Run",
                name="Recent imported run",
                start_time_utc=datetime.now(UTC) - timedelta(days=30),
            )
        )
        session.commit()

        result = sync_module.strava_sync_recent(session, owner.id)

        assert result == {"imported": 0, "skipped": 0, "streams": 0}
        assert len(requested_after) == 1
        assert requested_after[0] is not None
        days_back = datetime.now(UTC) - requested_after[0]
        assert timedelta(days=729) <= days_back <= timedelta(days=731)


def test_strava_rate_limit_records_error_without_crashing(client, monkeypatch) -> None:
    """Verify Strava rate limits are recorded without raising from sync."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.core.exceptions import AppException
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    class RateLimitedStravaClient:
        """Provide a rate-limited Strava API response."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Raise a rate limit error for activity listing."""
            _ = after, before
            raise AppException(429, "STRAVA_RATE_LIMITED", "Strava rate limit reached")

    monkeypatch.setattr(sync_module, "StravaClient", RateLimitedStravaClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        connection = ProviderConnection(
            user_id=owner.id,
            provider="strava",
            status="connected",
            access_token_encrypted=encrypt_secret("access-token"),
            refresh_token_encrypted=encrypt_secret("refresh-token"),
            access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        session.add(connection)
        session.commit()

        result = sync_module.strava_sync_history(session, owner.id)

        assert result == {"imported": 0, "skipped": 0, "streams": 0}
        assert connection.status == "connected"
        assert connection.last_error == "Strava rate limit reached"
