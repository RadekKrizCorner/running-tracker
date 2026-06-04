from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_notifications_require_authentication(client) -> None:
    """Verify notifications are owner-only."""
    response = client.get("/api/v1/notifications")

    assert response.status_code == 401


def test_delete_notification_removes_it_and_updates_summary(client) -> None:
    """Verify owner can delete one notification."""
    from app.db.session import get_session_factory
    from app.models import Notification, User

    setup_and_login(client)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        notification = Notification(
            user_id=owner.id,
            type="activity_notes_reminder",
            title="Doplň poznámky",
            body="Běh se synchronizoval.",
            action_url="/activities/activity-1?focus=notes",
            action_label="Doplnit poznámky",
            source_type="activity",
            source_id="activity-1",
        )
        session.add(notification)
        session.commit()
        notification_id = notification.id

    assert client.get("/api/v1/notifications/summary").json() == {"unread_count": 1}

    response = client.delete(f"/api/v1/notifications/{notification_id}")

    assert response.status_code == 204
    assert client.get("/api/v1/notifications").json() == []
    assert client.get("/api/v1/notifications/summary").json() == {"unread_count": 0}


def test_delete_missing_notification_returns_not_found(client) -> None:
    """Verify deleting an unknown notification fails clearly."""
    setup_and_login(client)

    response = client.delete("/api/v1/notifications/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_strava_sync_creates_one_note_reminder_notification(client, monkeypatch) -> None:
    """Verify a newly synced run creates one activity-notes notification."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    setup_and_login(client)
    _install_single_activity_strava_client(
        monkeypatch,
        sync_module,
        strava_id="987",
        name="Notification run",
        start_date=_iso_days_ago(1),
    )

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

        sync_module.strava_sync_history(session, owner.id)
        sync_module.strava_sync_history(session, owner.id)

    response = client.get("/api/v1/notifications")

    assert response.status_code == 200
    notifications = response.json()
    assert len(notifications) == 1
    assert notifications[0]["type"] == "activity_notes_reminder"
    assert notifications[0]["title"] == "Doplň poznámky k běhu Notification run"
    assert notifications[0]["body"] == "Notification run se synchronizoval. Doplň poznámky, dokud je běh čerstvý."
    assert notifications[0]["action_label"] == "Doplnit poznámky"
    assert notifications[0]["read_at"] is None
    assert notifications[0]["action_url"].startswith("/activities/")
    assert notifications[0]["action_url"].endswith("?focus=notes")

    summary = client.get("/api/v1/notifications/summary")
    assert summary.status_code == 200
    assert summary.json() == {"unread_count": 1}

    mark_read = client.post(f"/api/v1/notifications/{notifications[0]['id']}/read")
    assert mark_read.status_code == 200
    assert mark_read.json()["read_at"] is not None
    assert client.get("/api/v1/notifications/summary").json() == {"unread_count": 0}


def test_strava_sync_does_not_notify_for_old_historical_runs(client, monkeypatch) -> None:
    """Verify historical backfills do not create stale notes notifications."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User

    setup_and_login(client)
    _install_single_activity_strava_client(
        monkeypatch,
        sync_module,
        strava_id="654",
        name="Old history run",
        start_date=_iso_days_ago(90),
    )

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

        sync_module.strava_sync_history(session, owner.id)

    assert client.get("/api/v1/notifications").json() == []
    assert client.get("/api/v1/notifications/summary").json() == {"unread_count": 0}


def test_strava_sync_uses_english_notification_text_when_locale_is_english(client, monkeypatch) -> None:
    """Verify sync notification copy follows owner language preference."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import ProviderConnection, User, UserPreference

    setup_and_login(client)
    _install_single_activity_strava_client(
        monkeypatch,
        sync_module,
        strava_id="321",
        name="English notification run",
        start_date=_iso_days_ago(1),
    )

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            UserPreference(
                user_id=owner.id,
                locale="en-US",
                dashboard_mode="advanced",
                favorite_template_ids=[],
                recent_template_ids=[],
                pace_zones=[],
                elevation_correction_enabled=False,
                elevation_correction_mode="only_when_zero",
            )
        )
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

        sync_module.strava_sync_history(session, owner.id)

    notifications = client.get("/api/v1/notifications").json()
    assert notifications[0]["title"] == "Add notes to English notification run"
    assert notifications[0]["body"] == "English notification run was synced. Add notes while it is fresh."
    assert notifications[0]["action_label"] == "Add notes"


def _install_single_activity_strava_client(monkeypatch, sync_module, strava_id: str, name: str, start_date: str) -> None:
    """Install a fake Strava client that returns one running activity."""

    class NotificationStravaClient:
        """Provide one running activity for notification tests."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return one running activity summary."""
            _ = after, before
            return [
                {
                    "id": strava_id,
                    "sport_type": "Run",
                    "type": "Run",
                    "name": name,
                    "start_date": start_date,
                    "distance": 5000,
                    "moving_time": 1800,
                }
            ]

        def fetch_activity_details(self, activity_id: str) -> dict:
            """Return activity details."""
            assert activity_id == strava_id
            return {
                "id": strava_id,
                "sport_type": "Run",
                "name": name,
                "start_date": start_date,
                "distance": 5000,
                "moving_time": 1800,
            }

        def fetch_activity_streams(self, activity_id: str) -> dict:
            """Return no activity streams."""
            assert activity_id == strava_id
            return {}

    monkeypatch.setattr(sync_module, "StravaClient", NotificationStravaClient)


def _iso_days_ago(days: int) -> str:
    """Return an ISO timestamp a number of days before now."""
    return (datetime.now(UTC) - timedelta(days=days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
