from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_calendar_returns_activity_dates_in_owner_timezone(client) -> None:
    """Verify calendar activity dates are returned in the owner timezone."""
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="calendar-timezone-boundary",
                sport_type="Run",
                name="Late UTC run",
                start_time_utc=datetime(2026, 4, 26, 22, 30, tzinfo=UTC),
                distance_m=Decimal("5000"),
                moving_time_s=1800,
            )
        )
        session.commit()

    response = client.get("/api/v1/calendar?start_date=2026-04-27&end_date=2026-04-27")

    assert response.status_code == 200
    assert response.json()["activities"][0]["date"] == "2026-04-27"


def test_calendar_returns_custom_events_with_plans_and_activities(client) -> None:
    """Verify calendar includes planned workouts, completed activities, and custom events."""
    from app.db.session import get_session_factory
    from app.models import Activity, CalendarEvent, PlannedWorkout, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add_all(
            [
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=datetime(2026, 5, 2, tzinfo=UTC).date(),
                    workout_type="easy",
                    title="Easy planned",
                    status="planned",
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="finished-calendar-run",
                    sport_type="Run",
                    name="Completed run",
                    start_time_utc=datetime(2026, 5, 2, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("7000"),
                    moving_time_s=2400,
                    intensity_class="easy",
                ),
                CalendarEvent(
                    user_id=owner.id,
                    event_date=datetime(2026, 5, 3, tzinfo=UTC).date(),
                    event_type="race",
                    title="Local 10K race",
                    notes="Tune-up race",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/calendar?start_date=2026-05-02&end_date=2026-05-03")

    assert response.status_code == 200
    body = response.json()
    assert body["planned_workouts"][0]["title"] == "Easy planned"
    assert body["activities"][0]["name"] == "Completed run"
    assert body["events"][0]["title"] == "Local 10K race"


def test_calendar_returns_multiple_same_day_planned_workouts(client) -> None:
    """Verify calendar preserves multiple planned sessions on one date."""
    setup_and_login(client)

    morning = client.post(
        "/api/v1/planned-workouts",
        json={
            "scheduled_date": "2026-05-18",
            "session_label": "Ráno",
            "sort_order": 0,
            "workout_type": "tempo",
            "title": "Threshold intervaly",
            "target_duration_s": 2700,
            "target_intensity": "hard",
        },
    )
    afternoon = client.post(
        "/api/v1/planned-workouts",
        json={
            "scheduled_date": "2026-05-18",
            "session_label": "Odpoledne",
            "sort_order": 1,
            "workout_type": "tempo",
            "title": "Threshold tempo",
            "target_duration_s": 2700,
            "target_intensity": "hard",
        },
    )
    assert morning.status_code == 200
    assert afternoon.status_code == 200

    response = client.get("/api/v1/calendar?start_date=2026-05-18&end_date=2026-05-18")

    assert response.status_code == 200
    assert [(workout["session_label"], workout["sort_order"], workout["title"]) for workout in response.json()["planned_workouts"]] == [
        ("Ráno", 0, "Threshold intervaly"),
        ("Odpoledne", 1, "Threshold tempo"),
    ]


def test_owner_can_create_custom_calendar_event(client) -> None:
    """Verify owner can add a race or custom event to the calendar."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/calendar/events",
        json={
            "event_date": "2026-06-01",
            "event_type": "race",
            "title": "Goal race",
            "notes": "A race event, not a workout.",
        },
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Goal race"

    calendar = client.get("/api/v1/calendar?start_date=2026-06-01&end_date=2026-06-01")
    assert calendar.status_code == 200
    assert calendar.json()["events"][0]["event_type"] == "race"
