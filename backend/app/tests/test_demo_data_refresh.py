from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models import Activity, ActivityStream, Event, PlannedWorkout, ProviderConnection, User, WeeklyMetric


def test_refresh_demo_account_creates_rolling_demo_data(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo refresh creates realistic rolling data without provider tokens."""
    _ = client
    settings = _demo_settings(monkeypatch)

    from app.services.demo_data_service import refresh_demo_account

    with get_session_factory()() as session:
        result = refresh_demo_account(session, settings, today=date(2026, 6, 4), history_weeks=12)
        demo = session.scalar(select(User).where(User.email == "demo@example.com"))
        assert demo is not None
        latest_activity = session.scalar(
            select(Activity)
            .where(Activity.user_id == demo.id)
            .order_by(Activity.start_time_utc.desc())
            .limit(1)
        )
        future_workout = session.scalar(
            select(PlannedWorkout)
            .where(PlannedWorkout.user_id == demo.id, PlannedWorkout.scheduled_date > date(2026, 6, 4))
            .limit(1)
        )

        assert demo.is_demo is True
        assert result.activities > 0
        assert result.streams >= result.activities * 7
        assert result.planned_workouts > 0
        assert result.events > 0
        assert result.gear > 0
        assert latest_activity is not None
        assert (date(2026, 6, 4) - latest_activity.start_time_utc.date()).days <= 3
        assert future_workout is not None
        assert session.scalar(select(Event).where(Event.user_id == demo.id)) is not None
        assert session.scalar(select(WeeklyMetric).where(WeeklyMetric.user_id == demo.id)) is not None
        assert session.scalar(select(ProviderConnection).where(ProviderConnection.user_id == demo.id)) is None


def test_refresh_demo_account_creates_synthetic_capital_city_routes(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo route streams use synthetic public city coordinates."""
    _ = client
    settings = _demo_settings(monkeypatch)

    from app.services.demo_data_service import refresh_demo_account

    with get_session_factory()() as session:
        refresh_demo_account(session, settings, today=date(2026, 6, 4), history_weeks=4)
        demo = session.scalar(select(User).where(User.email == "demo@example.com"))
        assert demo is not None
        stream = session.scalar(
            select(ActivityStream)
            .join(Activity, Activity.id == ActivityStream.activity_id)
            .where(Activity.user_id == demo.id, ActivityStream.stream_type == "latlng")
            .limit(1)
        )

        assert stream is not None
        assert isinstance(stream.data, list)
        assert len(stream.data) >= 20
        assert all(isinstance(point, list) and len(point) == 2 for point in stream.data)
        assert any(_coordinate_is_known_public_city(point) for point in stream.data)


def test_refresh_demo_account_does_not_touch_owner_data(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo refresh leaves the real owner and owner activities untouched."""
    _ = client
    settings = _demo_settings(monkeypatch)

    from app.services.demo_data_service import refresh_demo_account

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com", User.is_demo.is_(False)))
        assert owner is not None
        session.flush()
        owner_activity = Activity(
            user_id=owner.id,
            provider="manual",
            provider_activity_id="owner-1",
            sport_type="Run",
            workout_type="easy",
            name="Owner run",
            start_time_utc=datetime(2026, 6, 1, 6, 0, tzinfo=UTC),
            start_time_local=datetime(2026, 6, 1, 8, 0),
            timezone="Europe/Prague",
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            elapsed_time_s=1860,
        )
        session.add(owner_activity)
        session.commit()
        owner_activity_id = owner_activity.id

        refresh_demo_account(session, settings, today=date(2026, 6, 4), history_weeks=4)

        assert session.scalar(select(Activity).where(Activity.id == owner_activity_id)) is not None
        assert session.scalar(select(User).where(User.id == owner.id, User.is_demo.is_(False))) is not None


def test_refresh_demo_account_removes_stale_demo_provider_connections(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo refresh removes stale provider connections from the demo account."""
    _ = client
    settings = _demo_settings(monkeypatch)

    from app.services.demo_data_service import refresh_demo_account

    with get_session_factory()() as session:
        demo = User(email="demo@example.com", display_name="Portfolio Demo", is_demo=True, password_hash="stale")
        session.add(demo)
        session.flush()
        session.add(
            ProviderConnection(
                user_id=demo.id,
                provider="strava",
                provider_user_id="demo-strava",
                access_token_encrypted="stale-access-token",
                refresh_token_encrypted="stale-refresh-token",
            )
        )
        session.commit()

        refresh_demo_account(session, settings, today=date(2026, 6, 4), history_weeks=4)

        refreshed_demo = session.scalar(select(User).where(User.email == "demo@example.com"))
        assert refreshed_demo is not None
        assert session.scalar(select(ProviderConnection).where(ProviderConnection.user_id == refreshed_demo.id)) is None


def _demo_settings(monkeypatch: pytest.MonkeyPatch):
    """Return settings with demo account enabled."""
    monkeypatch.setenv("DEMO_ACCOUNT_ENABLED", "true")
    monkeypatch.setenv("DEMO_ACCOUNT_EMAIL", "demo@example.com")
    monkeypatch.setenv("DEMO_ACCOUNT_PASSWORD", "demo password")
    monkeypatch.setenv("DEMO_ACCOUNT_DISPLAY_NAME", "Portfolio Demo")
    get_settings.cache_clear()
    return get_settings()


def _coordinate_is_known_public_city(point: object) -> bool:
    """Return whether a coordinate is near a configured public city cluster."""
    if not isinstance(point, list) or len(point) != 2:
        return False
    lat = float(point[0])
    lng = float(point[1])
    return (
        (50.0 <= lat <= 50.2 and 14.2 <= lng <= 14.6)
        or (51.4 <= lat <= 51.6 and -0.3 <= lng <= 0.1)
        or (48.8 <= lat <= 49.0 and 2.2 <= lng <= 2.5)
        or (52.4 <= lat <= 52.6 and 13.2 <= lng <= 13.5)
        or (48.1 <= lat <= 48.3 and 16.2 <= lng <= 16.5)
    )
