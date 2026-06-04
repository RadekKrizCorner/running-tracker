from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_positive_elevation_gain_ignores_noise_and_counts_real_climbs() -> None:
    """Verify DEM elevation gain ignores small drift and counts sustained climbs."""
    from app.analytics.elevation import calculate_positive_elevation_gain

    gain = calculate_positive_elevation_gain(
        [100.0, 100.8, 101.6, 102.4, 103.4, 98.5, 99.0, 102.7],
        noise_threshold_m=3.0,
    )

    assert round(gain, 1) == 7.6


def test_open_meteo_elevation_client_uses_get_query(monkeypatch) -> None:
    """Verify Open-Meteo elevation responses are supported."""
    import app.providers.elevation.client as client_module
    from app.providers.elevation.client import ElevationClient

    class FakeResponse:
        """Represent an Open-Meteo elevation response."""

        def raise_for_status(self) -> None:
            """Accept the response as successful."""
            return None

        def json(self) -> dict:
            """Return Open-Meteo's elevation response shape."""
            return {"elevation": [250.0, 255.5]}

    def fake_get(url: str, params: dict, timeout: float) -> FakeResponse:
        """Verify the client sends Open-Meteo coordinates as query params."""
        assert url == "https://api.open-meteo.com/v1/elevation"
        assert params == {"latitude": "50.0,50.1", "longitude": "14.0,14.1"}
        assert timeout == 20.0
        return FakeResponse()

    def fail_post(*_args, **_kwargs) -> None:
        """Fail if the Open-Meteo path uses POST."""
        raise AssertionError("Open-Meteo should use GET")

    monkeypatch.setattr(client_module.httpx, "get", fake_get)
    monkeypatch.setattr(client_module.httpx, "post", fail_post)

    elevations = ElevationClient("https://api.open-meteo.com/v1/elevation").lookup_elevations([(50.0, 14.0), (50.1, 14.1)])

    assert elevations == [250.0, 255.5]


def test_open_meteo_elevation_client_retries_rate_limit(monkeypatch) -> None:
    """Verify transient Open-Meteo rate limits are retried."""
    import httpx

    import app.providers.elevation.client as client_module
    from app.providers.elevation.client import ElevationClient

    calls = 0

    class FakeResponse:
        """Represent one provider response."""

        def __init__(self, status_code: int) -> None:
            """Store the response status."""
            self.status_code = status_code

        def raise_for_status(self) -> None:
            """Raise an HTTP status error for non-success responses."""
            if self.status_code >= 400:
                request = httpx.Request("GET", "https://api.open-meteo.com/v1/elevation")
                response = httpx.Response(self.status_code, request=request)
                raise httpx.HTTPStatusError("rate limited", request=request, response=response)

        def json(self) -> dict:
            """Return Open-Meteo's elevation response shape."""
            return {"elevation": [250.0, 255.0]}

    def fake_get(_url: str, params: dict, timeout: float) -> FakeResponse:
        """Return 429 once and then a successful response."""
        nonlocal calls
        calls += 1
        return FakeResponse(429 if calls == 1 else 200)

    def fake_sleep(_seconds: float) -> None:
        """Avoid slowing the retry test."""
        return None

    monkeypatch.setattr(client_module.httpx, "get", fake_get)
    monkeypatch.setattr(client_module.time, "sleep", fake_sleep)

    elevations = ElevationClient("https://api.open-meteo.com/v1/elevation").lookup_elevations([(50.0, 14.0), (50.1, 14.1)])

    assert elevations == [250.0, 255.0]
    assert calls == 2


def test_elevation_preferences_can_be_read_and_updated(client) -> None:
    """Verify owner can enable GPS-based elevation correction in preferences."""
    setup_and_login(client)

    initial = client.get("/api/v1/profile/preferences")

    assert initial.status_code == 200
    assert initial.json()["elevation_correction_enabled"] is False
    assert initial.json()["elevation_correction_mode"] == "only_when_zero"
    assert initial.json()["elevation_provider_url"] is None

    response = client.patch(
        "/api/v1/profile/preferences",
        json={
            "elevation_correction_enabled": True,
            "elevation_correction_mode": "always",
            "elevation_provider_url": "https://elevation.example.test/lookup",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["elevation_correction_enabled"] is True
    assert body["elevation_correction_mode"] == "always"
    assert body["elevation_provider_url"] == "https://elevation.example.test/lookup"

    cleared = client.patch("/api/v1/profile/preferences", json={"elevation_provider_url": None})

    assert cleared.status_code == 200
    assert cleared.json()["elevation_provider_url"] is None


def test_elevation_recompute_updates_zero_gain_activity_from_gps_streams(client, monkeypatch) -> None:
    """Verify recompute stores corrected elevation and recalculates weekly metrics."""
    import app.services.elevation_service as elevation_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User, UserPreference, WeeklyMetric

    class FakeElevationClient:
        """Return deterministic DEM elevations for test GPS points."""

        def __init__(self, provider_url: str) -> None:
            """Create a fake client and keep the provider URL."""
            assert provider_url == "https://elevation.example.test/lookup"

        def lookup_elevations(self, points: list[tuple[float, float]]) -> list[float]:
            """Return elevations matching the provided GPS points."""
            assert points == [(50.0, 14.0), (50.001, 14.001), (50.002, 14.002), (50.003, 14.003)]
            return [100.0, 101.0, 105.0, 104.0]

    monkeypatch.setattr(elevation_service, "ElevationClient", FakeElevationClient)
    setup_and_login(client)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
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
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="zero-elevation",
            sport_type="Run",
            name="Broken elevation run",
            start_time_utc=datetime(2026, 5, 4, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            elevation_gain_m=Decimal("0"),
            elevation_gain_source="strava",
        )
        session.add(activity)
        session.flush()
        session.add(
            ActivityStream(
                activity_id=activity.id,
                stream_type="latlng",
                data=[[50.0, 14.0], [50.001, 14.001], [50.002, 14.002], [50.003, 14.003]],
                sample_count=4,
            )
        )
        session.commit()

    response = client.post("/api/v1/profile/elevation/recompute")

    assert response.status_code == 200
    assert response.json() == {"recomputed_activities": 1, "skipped_activities": 0, "failed_activities": 0}
    with get_session_factory()() as session:
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "zero-elevation"))
        assert activity is not None
        assert float(activity.elevation_gain_m or 0) == 5.0
        assert activity.elevation_gain_source == "dem_corrected"
        corrected = session.scalar(
            select(ActivityStream).where(
                ActivityStream.activity_id == activity.id,
                ActivityStream.stream_type == "elevation_corrected",
            )
        )
        assert corrected is not None
        assert corrected.data == [100.0, 101.0, 105.0, 104.0]
        weekly = session.scalar(select(WeeklyMetric).where(WeeklyMetric.user_id == activity.user_id))
        assert weekly is not None
        assert float(weekly.elevation_gain_m) == 5.0


def test_elevation_recompute_limits_points_sent_to_public_provider(client, monkeypatch) -> None:
    """Verify recompute samples long GPS streams before provider lookup."""
    import app.services.elevation_service as elevation_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User, UserPreference

    class FakeElevationClient:
        """Capture sampled points and return matching elevations."""

        seen_points: list[tuple[float, float]] = []

        def __init__(self, provider_url: str) -> None:
            """Create a fake client for one provider URL."""
            assert provider_url == "https://api.open-meteo.com/v1/elevation"

        def lookup_elevations(self, points: list[tuple[float, float]]) -> list[float]:
            """Return a gentle climb for sampled points."""
            self.__class__.seen_points = points
            return [100.0 + index for index, _point in enumerate(points)]

    monkeypatch.setattr(elevation_service, "ElevationClient", FakeElevationClient)
    setup_and_login(client)
    gps_points = [[50.0 + index / 10000, 14.0 + index / 10000] for index in range(250)]

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            UserPreference(
                user_id=owner.id,
                locale="cs-CZ",
                dashboard_mode="advanced",
                favorite_template_ids=[],
                recent_template_ids=[],
                pace_zones=[],
                elevation_correction_enabled=True,
                elevation_correction_mode="always",
                elevation_provider_url="https://api.open-meteo.com/v1/elevation",
            )
        )
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="long-gps-track",
            sport_type="Run",
            name="Long GPS track",
            start_time_utc=datetime(2026, 5, 4, 6, 0, tzinfo=UTC),
            distance_m=Decimal("12000"),
            moving_time_s=4200,
            elevation_gain_m=Decimal("0"),
        )
        session.add(activity)
        session.flush()
        session.add(ActivityStream(activity_id=activity.id, stream_type="latlng", data=gps_points, sample_count=len(gps_points)))
        session.commit()

    response = client.post("/api/v1/profile/elevation/recompute")

    assert response.status_code == 200
    assert len(FakeElevationClient.seen_points) == 100


def test_elevation_recompute_prioritizes_zero_gain_activities(client, monkeypatch) -> None:
    """Verify zero-gain runs are corrected before already-elevated runs."""
    from app.core.exceptions import AppException
    import app.services.elevation_service as elevation_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User, UserPreference

    class FakeElevationClient:
        """Succeed once and then fail to model provider rate limiting."""

        calls = 0

        def __init__(self, provider_url: str) -> None:
            """Create a fake client for one provider URL."""
            assert provider_url == "https://api.open-meteo.com/v1/elevation"

        def lookup_elevations(self, points: list[tuple[float, float]]) -> list[float]:
            """Return elevations for the first activity and fail later."""
            self.__class__.calls += 1
            if self.__class__.calls > 1:
                raise AppException(502, "ELEVATION_PROVIDER_FAILED", "Elevation provider request failed")
            assert points == [(50.0, 14.0), (50.001, 14.001), (50.002, 14.002), (50.003, 14.003)]
            return [100.0, 102.0, 106.0, 105.0]

    monkeypatch.setattr(elevation_service, "ElevationClient", FakeElevationClient)
    setup_and_login(client)

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            UserPreference(
                user_id=owner.id,
                locale="cs-CZ",
                dashboard_mode="advanced",
                favorite_template_ids=[],
                recent_template_ids=[],
                pace_zones=[],
                elevation_correction_enabled=True,
                elevation_correction_mode="always",
                elevation_provider_url="https://api.open-meteo.com/v1/elevation",
            )
        )
        already_elevated = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="already-elevated",
            sport_type="Run",
            name="Already elevated run",
            start_time_utc=datetime(2026, 5, 4, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            elevation_gain_m=Decimal("80"),
        )
        zero_gain = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="zero-gain-priority",
            sport_type="Run",
            name="Zero gain priority run",
            start_time_utc=datetime(2026, 5, 5, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            elevation_gain_m=Decimal("0"),
        )
        session.add_all([already_elevated, zero_gain])
        session.flush()
        session.add_all(
            [
                ActivityStream(
                    activity_id=already_elevated.id,
                    stream_type="latlng",
                    data=[[51.0, 15.0], [51.001, 15.001], [51.002, 15.002], [51.003, 15.003]],
                    sample_count=4,
                ),
                ActivityStream(
                    activity_id=zero_gain.id,
                    stream_type="latlng",
                    data=[[50.0, 14.0], [50.001, 14.001], [50.002, 14.002], [50.003, 14.003]],
                    sample_count=4,
                ),
            ]
        )
        session.commit()

    response = client.post("/api/v1/profile/elevation/recompute")

    assert response.status_code == 200
    assert response.json()["recomputed_activities"] == 1
    assert response.json()["failed_activities"] == 1
    with get_session_factory()() as session:
        activity = session.scalar(select(Activity).where(Activity.provider_activity_id == "zero-gain-priority"))
        assert activity is not None
        assert float(activity.elevation_gain_m or 0) == 6.0
        assert activity.elevation_gain_source == "dem_corrected"
