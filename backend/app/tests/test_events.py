from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select

from app.schemas.event import EventUpdate
from app.tests.conftest import setup_and_login


def test_owner_can_create_events_with_preparation_metrics(client, monkeypatch) -> None:
    """Verify Events track countdown, goals, and preparation metrics."""
    import app.services.event_service as event_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(event_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="event-recent-run",
                    sport_type="Run",
                    name="Recent easy run",
                    start_time_utc=datetime(2026, 4, 20, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("8000"),
                    moving_time_s=3000,
                    computed_load=Decimal("100"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="event-long-run",
                    sport_type="Run",
                    name="Recent long run",
                    start_time_utc=datetime(2026, 4, 25, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("14000"),
                    moving_time_s=5400,
                    computed_load=Decimal("180"),
                    intensity_class="moderate",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 2),
                    workout_type="long",
                    title="Long run",
                    target_distance_m=Decimal("15000"),
                    target_duration_s=6000,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 28),
                    workout_type="tempo",
                    title="Missed tempo",
                    target_distance_m=Decimal("8000"),
                    target_duration_s=3000,
                    target_intensity="hard",
                    status="planned",
                ),
            ]
        )
        session.commit()

    response = client.post(
        "/api/v1/events",
        json={
            "name": "Spring 10K",
            "event_date": "2026-06-01",
            "location": "Prague",
            "event_type": "10k",
            "distance_m": 10000,
            "elevation_gain_m": 120,
            "surface": "road",
            "priority": "A",
            "target_time_s": 3000,
            "website_url": "https://example.test/race",
            "goal_notes": "Run steady.",
            "course_notes": "Rolling first half.",
            "fueling_notes": "Light breakfast.",
            "gear_notes": "Race shoes.",
            "travel_notes": "Take metro.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Spring 10K"
    assert body["days_until_start"] == 33
    assert body["target_pace_s_per_km"] == 300
    assert body["preparation"]["phase"] == "build"
    assert body["preparation"]["current_4w_distance_m"] == 22000
    assert body["preparation"]["current_4w_load"] == 280
    assert body["preparation"]["longest_run_8w_m"] == 14000
    assert body["preparation"]["long_run_event_distance_ratio"] == 1.4
    assert body["preparation"]["planned_distance_to_event_m"] == 15000
    assert body["preparation"]["planned_load_to_event"] == 200
    assert body["preparation"]["missed_planned_sessions"] == 1

    list_response = client.get("/api/v1/events")
    assert list_response.status_code == 200
    assert list_response.json()[0]["name"] == "Spring 10K"


def test_calendar_includes_goal_events_from_events(client) -> None:
    """Verify race Events appear on the calendar as linked events."""
    setup_and_login(client)
    event_response = client.post(
        "/api/v1/events",
        json={
            "name": "Autumn Half",
            "event_date": "2026-10-04",
            "location": "Brno",
            "event_type": "half_marathon",
            "distance_m": 21097,
            "surface": "road",
            "priority": "B",
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    calendar = client.get("/api/v1/calendar?start_date=2026-10-01&end_date=2026-10-05")

    assert calendar.status_code == 200
    event = calendar.json()["events"][0]
    assert event["id"] == event_id
    assert event["title"] == "Autumn Half"
    assert event["source_type"] == "event"
    assert event["source_id"] == event_id


def test_owner_can_update_event_notes_and_course_data(client) -> None:
    """Verify owner can edit preparation notes, poster image, and course map fields."""
    setup_and_login(client)
    event_response = client.post(
        "/api/v1/events",
        json={
            "name": "Autumn Half",
            "event_date": "2026-10-04",
            "location": "Brno",
            "event_type": "half_marathon",
            "distance_m": 21097,
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    response = client.patch(
        f"/api/v1/events/{event_id}",
        json={
            "goal_notes": "Start controlled and finish strong.",
            "course_notes": "Rolling second half.",
            "fueling_notes": "Gel before the final climb.",
            "gear_notes": "Race shoes and light vest.",
            "travel_notes": "Train to Brno main station.",
            "course_map_url": "https://mapy.com/s/example-course",
            "course_gpx": "<gpx><trk><trkseg><trkpt lat=\"49.2\" lon=\"16.6\" /></trkseg></trk></gpx>",
            "poster_image_data": "data:image/png;base64,cG9zdGVy",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["goal_notes"] == "Start controlled and finish strong."
    assert body["course_notes"] == "Rolling second half."
    assert body["fueling_notes"] == "Gel before the final climb."
    assert body["gear_notes"] == "Race shoes and light vest."
    assert body["travel_notes"] == "Train to Brno main station."
    assert body["course_map_url"] == "https://mapy.com/s/example-course"
    assert "trkpt" in body["course_gpx"]
    assert body["poster_image_data"] == "data:image/png;base64,cG9zdGVy"


def test_event_update_accepts_poster_image_data_above_old_two_mb_limit() -> None:
    """Verify poster image validation accepts data URLs above the old 2 MB limit."""
    poster_image_data = "data:image/png;base64," + ("a" * 3_000_000)

    update = EventUpdate(poster_image_data=poster_image_data)

    assert update.poster_image_data == poster_image_data


def test_event_planning_guidance_returns_actionable_targets(client, monkeypatch) -> None:
    """Verify event detail can request transparent preparation guidance."""
    import app.services.event_service as event_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(event_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="guidance-long",
                sport_type="Run",
                name="Current long run",
                start_time_utc=datetime(2026, 4, 25, 6, 0, tzinfo=UTC),
                distance_m=Decimal("9000"),
                moving_time_s=3300,
                computed_load=Decimal("100"),
                intensity_class="easy",
            )
        )
        session.add(
            PlannedWorkout(
                user_id=owner.id,
                scheduled_date=date(2026, 5, 4),
                workout_type="easy",
                title="Future easy",
                target_distance_m=Decimal("6000"),
                target_duration_s=2400,
                target_intensity="easy",
                status="planned",
            )
        )
        session.commit()

    event_response = client.post(
        "/api/v1/events",
        json={
            "name": "City 10K",
            "event_date": "2026-06-01",
            "event_type": "10k",
            "distance_m": 10000,
            "priority": "A",
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    guidance = client.get(f"/api/v1/events/{event_id}/planning-guidance")

    assert guidance.status_code == 200
    body = guidance.json()
    assert body["event_id"] == event_id
    assert body["weeks_until_start"] == 4.7
    assert body["suggested_weekly_distance_m"] > 0
    assert len(body["suggested_sessions"]) >= 2
    assert body["suggested_sessions"][0]["title"] == "Lehký aerobní běh"
    assert body["messages"][0]["title"] == "Dlouhý běh je blízko"
    assert body["messages"][0]["tone"] in {"success", "warning", "neutral"}


def test_event_planning_guidance_uses_english_when_locale_is_english(client, monkeypatch) -> None:
    """Verify event guidance copy follows owner language preference."""
    import app.services.event_service as event_service
    from app.db.session import get_session_factory
    from app.models import User, UserPreference

    setup_and_login(client)
    monkeypatch.setattr(event_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
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
        session.commit()

    event_response = client.post(
        "/api/v1/events",
        json={
            "name": "City 10K",
            "event_date": "2026-06-01",
            "event_type": "10k",
            "distance_m": 10000,
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    guidance = client.get(f"/api/v1/events/{event_id}/planning-guidance")

    assert guidance.status_code == 200
    body = guidance.json()
    assert body["suggested_sessions"][0]["title"] == "Easy aerobic run"
    assert body["messages"][0]["title"] == "Long run gap"
