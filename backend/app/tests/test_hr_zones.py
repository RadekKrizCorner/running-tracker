from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_owner_can_create_dated_hr_zone_set(client) -> None:
    """Verify owner can store a dated five-zone HR profile."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/profile/hr-zones",
        json={
            "name": "Current zones",
            "effective_from": "2026-01-01",
            "zones": [
                {"name": "Z1", "min_hr": 90, "max_hr": 120},
                {"name": "Z2", "min_hr": 121, "max_hr": 140},
                {"name": "Z3", "min_hr": 141, "max_hr": 160},
                {"name": "Z4", "min_hr": 161, "max_hr": 180},
                {"name": "Z5", "min_hr": 181, "max_hr": 205},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Current zones"
    assert body["effective_from"] == "2026-01-01"
    assert [zone["name"] for zone in body["zones"]] == ["Z1", "Z2", "Z3", "Z4", "Z5"]

    list_response = client.get("/api/v1/profile/hr-zones")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_strava_sync_uses_effective_hr_zones_for_stream_metrics(client, monkeypatch) -> None:
    """Verify Strava sync stores HR-based load and intensity from dated zones."""
    import app.providers.strava.sync as sync_module
    from app.core.crypto import encrypt_secret
    from app.db.session import get_session_factory
    from app.models import Activity, HeartRateZoneSet, ProviderConnection, User

    class ZoneAwareStravaClient:
        """Provide one activity with mostly Z2 heart-rate samples."""

        def __init__(self, access_token: str | None = None) -> None:
            """Create the fake Strava client."""
            self.access_token = access_token

        def fetch_activities(self, after=None, before=None) -> list[dict]:
            """Return one running activity summary."""
            _ = after, before
            return [
                {
                    "id": 987,
                    "sport_type": "Run",
                    "type": "Run",
                    "name": "Zone run",
                    "start_date": "2026-04-27T06:00:00Z",
                    "start_date_local": "2026-04-27T08:00:00Z",
                    "distance": 5000,
                    "moving_time": 300,
                }
            ]

        def fetch_activity_details(self, activity_id: str) -> dict:
            """Return detailed activity fields."""
            assert activity_id == "987"
            return {
                "id": 987,
                "sport_type": "Run",
                "name": "Zone run",
                "start_date": "2026-04-27T06:00:00Z",
                "start_date_local": "2026-04-27T08:00:00Z",
                "distance": 5000,
                "moving_time": 300,
            }

        def fetch_activity_streams(self, activity_id: str) -> dict:
            """Return keyed HR stream data."""
            assert activity_id == "987"
            return {"heartrate": {"data": [130, 132, 134, 136, 138]}}

    monkeypatch.setattr(sync_module, "StravaClient", ZoneAwareStravaClient)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Spring zones",
                effective_from=date(2026, 1, 1),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
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

        result = sync_module.strava_sync_history(session, owner.id)

        assert result == {"imported": 1, "skipped": 0, "streams": 1}
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "987"))
        assert activity is not None
        assert activity.load_source == "hr_based"
        assert float(activity.computed_load or 0) == 10
        assert activity.intensity_class == "easy"


def test_creating_hr_zones_recomputes_existing_stream_metrics(client) -> None:
    """Verify saving zones updates existing activities with HR streams."""
    from decimal import Decimal

    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="already-synced",
            sport_type="Run",
            name="Already synced run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=300,
            computed_load=Decimal("10"),
            load_source="duration_estimated",
            intensity_class="unknown",
        )
        session.add(activity)
        session.flush()
        session.add(ActivityStream(activity_id=activity.id, stream_type="heartrate", data=[130, 132, 134, 136, 138], sample_count=5))
        session.commit()

    response = client.post(
        "/api/v1/profile/hr-zones",
        json={
            "name": "Current zones",
            "effective_from": "2026-01-01",
            "zones": [
                {"name": "Z1", "min_hr": 90, "max_hr": 120},
                {"name": "Z2", "min_hr": 121, "max_hr": 140},
                {"name": "Z3", "min_hr": 141, "max_hr": 160},
                {"name": "Z4", "min_hr": 161, "max_hr": 180},
                {"name": "Z5", "min_hr": 181, "max_hr": 205},
            ],
        },
    )

    assert response.status_code == 200
    with get_session_factory()() as session:
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "already-synced"))
        assert activity is not None
        assert activity.load_source == "hr_based"
        assert float(activity.computed_load or 0) == 10
        assert activity.intensity_class == "easy"


def test_creating_hr_zones_recomputes_existing_average_hr_metrics(client) -> None:
    """Verify saving zones updates activities that only have average HR."""
    from decimal import Decimal

    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            Activity(
                user_id=owner.id,
                provider="strava",
                provider_activity_id="average-hr-only",
                sport_type="Run",
                name="Average HR run",
                start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                distance_m=Decimal("5000"),
                moving_time_s=300,
                average_hr=Decimal("132"),
                computed_load=Decimal("10"),
                load_source="duration_estimated",
                intensity_class="unknown",
            )
        )
        session.commit()

    response = client.post(
        "/api/v1/profile/hr-zones",
        json={
            "name": "Current zones",
            "effective_from": "2026-01-01",
            "zones": [
                {"name": "Z1", "min_hr": 90, "max_hr": 120},
                {"name": "Z2", "min_hr": 121, "max_hr": 140},
                {"name": "Z3", "min_hr": 141, "max_hr": 160},
                {"name": "Z4", "min_hr": 161, "max_hr": 180},
                {"name": "Z5", "min_hr": 181, "max_hr": 205},
            ],
        },
    )

    assert response.status_code == 200
    with get_session_factory()() as session:
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "average-hr-only"))
        assert activity is not None
        assert activity.load_source == "hr_based"
        assert float(activity.computed_load or 0) == 10
        assert activity.intensity_class == "easy"


def test_recompute_hr_metrics_requires_zone_sets(client) -> None:
    """Verify explicit HR recompute explains that zones are required."""
    setup_and_login(client)

    response = client.post("/api/v1/profile/hr-zones/recompute")

    assert response.status_code == 409
    assert response.json()["code"] == "HR_ZONES_REQUIRED"


def test_hr_recompute_query_avoids_distinct_on_activity_json_columns() -> None:
    """Verify HR recompute query avoids Postgres DISTINCT over JSON columns."""
    from app.services.profile_service import recompute_user_hr_stream_metrics

    class GuardedSession:
        """Capture generated SQL statements for the recompute query."""

        def scalars(self, statement):
            """Return no rows after validating the SQL statement."""
            sql = str(statement.compile(compile_kwargs={"literal_binds": False}))
            assert not re.search(r"SELECT\s+DISTINCT\s+activities\.", sql)
            return []

    assert recompute_user_hr_stream_metrics(GuardedSession(), uuid4()) == 0  # type: ignore[arg-type]


def test_owner_can_recompute_hr_metrics_from_saved_zones(client) -> None:
    """Verify owner can explicitly recalculate imported HR activities."""
    from decimal import Decimal

    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Current zones",
                effective_from=date(2026, 1, 1),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
            )
        )
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="explicit-recompute",
            sport_type="Run",
            name="Needs recompute",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=300,
            computed_load=Decimal("10"),
            load_source="duration_estimated",
            intensity_class="unknown",
        )
        session.add(activity)
        session.flush()
        session.add(ActivityStream(activity_id=activity.id, stream_type="heartrate", data=[130, 132, 134, 136, 138], sample_count=5))
        session.commit()

    response = client.post("/api/v1/profile/hr-zones/recompute")

    assert response.status_code == 200
    assert response.json()["recomputed_activities"] == 1
    assert response.json()["remaining_unknown_activities"] == 0
    with get_session_factory()() as session:
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "explicit-recompute"))
        assert activity is not None
        assert activity.load_source == "hr_based"
        assert activity.intensity_class == "easy"


def test_recompute_reports_hr_activities_without_effective_zones(client) -> None:
    """Verify recompute explains when HR data has no effective zones."""
    from decimal import Decimal

    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Future zones",
                effective_from=date(2026, 5, 4),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
            )
        )
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="before-zones",
            sport_type="Run",
            name="Run before zones",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=300,
            computed_load=Decimal("10"),
            load_source="duration_estimated",
            intensity_class="unknown",
        )
        session.add(activity)
        session.flush()
        session.add(ActivityStream(activity_id=activity.id, stream_type="heartrate", data=[130, 132, 134], sample_count=3))
        session.commit()

    response = client.post("/api/v1/profile/hr-zones/recompute")

    assert response.status_code == 200
    body = response.json()
    assert body["recomputed_activities"] == 1
    assert body["remaining_unknown_activities"] == 1
    assert body["activities_without_effective_zones"] == 1
    assert body["earliest_activity_without_effective_zones"] == "2026-04-27"
