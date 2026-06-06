from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_event_readiness_schema_accepts_transparent_items() -> None:
    """Verify event readiness schemas accept transparent metric payloads."""
    from app.schemas.event import EventReadiness, EventReadinessIntensityMix, EventReadinessItem

    readiness = EventReadiness(
        event_id=uuid4(),
        phase="build",
        days_until_start=33,
        target_pace_s_per_km=300,
        recent_4w_distance_m=27000,
        recent_4w_load=360,
        recent_4w_run_count=3,
        longest_run_8w_m=18000,
        long_run_event_distance_ratio=1.8,
        planned_distance_to_event_m=23000,
        planned_load_to_event=500,
        planned_sessions_to_event=2,
        missed_planned_sessions=1,
        intensity_mix=EventReadinessIntensityMix(
            easy_time_s=3000,
            moderate_time_s=5400,
            hard_time_s=1200,
            unknown_time_s=0,
        ),
        readiness_items=[
            EventReadinessItem(
                key="long_run",
                label="Long run",
                value="180%",
                detail="Longest run compared with event distance.",
                status="good",
            )
        ],
        guidance_messages=[],
    )

    assert readiness.readiness_items[0].status == "good"
    assert readiness.intensity_mix.moderate_time_s == 5400


def test_event_readiness_summarizes_training_context(client, monkeypatch) -> None:
    """Verify event readiness summarizes recent, planned, and missed training."""
    import app.services.event_service as event_service
    from app.db.session import get_session_factory
    from app.models import Activity, Event, PlannedWorkout, User
    from app.services.event_service import event_readiness

    setup_and_login(client)
    monkeypatch.setattr(event_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        race = Event(
            user_id=owner.id,
            name="Spring 10K",
            event_date=date(2026, 6, 1),
            event_type="10k",
            distance_m=Decimal("10000"),
            target_time_s=3000,
            priority="A",
        )
        session.add_all(
            [
                race,
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="readiness-easy",
                    sport_type="Run",
                    name="Easy run",
                    start_time_utc=datetime(2026, 4, 20, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("8000"),
                    moving_time_s=3000,
                    computed_load=Decimal("100"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="readiness-moderate",
                    sport_type="Run",
                    name="Steady long run",
                    start_time_utc=datetime(2026, 4, 25, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("14000"),
                    moving_time_s=5400,
                    computed_load=Decimal("180"),
                    intensity_class="moderate",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="readiness-hard",
                    sport_type="Run",
                    name="Short hard run",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1200,
                    computed_load=Decimal("80"),
                    intensity_class="hard",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="readiness-older-long",
                    sport_type="Run",
                    name="Older long run",
                    start_time_utc=datetime(2026, 3, 15, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("18000"),
                    moving_time_s=6600,
                    computed_load=Decimal("220"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="readiness-ride",
                    sport_type="Ride",
                    name="Ignored ride",
                    start_time_utc=datetime(2026, 4, 26, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("20000"),
                    moving_time_s=3600,
                    computed_load=Decimal("99"),
                    intensity_class="moderate",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 2),
                    workout_type="long",
                    title="Future long",
                    target_distance_m=Decimal("15000"),
                    target_duration_s=6000,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 7),
                    workout_type="tempo",
                    title="Future tempo",
                    target_distance_m=Decimal("8000"),
                    target_duration_s=3000,
                    target_intensity="hard",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 3),
                    workout_type="rest",
                    title="Rest",
                    target_intensity="rest",
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
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 24),
                    workout_type="rest",
                    title="Skipped rest",
                    target_intensity="rest",
                    status="skipped",
                ),
            ]
        )
        session.commit()

        readiness = event_readiness(session, owner, race)

    items = {item.key: item for item in readiness.readiness_items}
    assert readiness.event_id == race.id
    assert readiness.phase == "build"
    assert readiness.days_until_start == 33
    assert readiness.target_pace_s_per_km == 300
    assert readiness.recent_4w_distance_m == 27000
    assert readiness.recent_4w_load == 360
    assert readiness.recent_4w_run_count == 3
    assert readiness.longest_run_8w_m == 18000
    assert readiness.long_run_event_distance_ratio == 1.8
    assert readiness.planned_distance_to_event_m == 23000
    assert readiness.planned_load_to_event == 500
    assert readiness.planned_sessions_to_event == 2
    assert readiness.missed_planned_sessions == 1
    assert readiness.intensity_mix.easy_time_s == 3000
    assert readiness.intensity_mix.moderate_time_s == 5400
    assert readiness.intensity_mix.hard_time_s == 1200
    assert readiness.intensity_mix.unknown_time_s == 0
    assert len(readiness.readiness_items) >= 4
    assert items["long_run"].status == "good"
    assert items["future_plan"].status == "good"
    assert items["missed_sessions"].status == "watch"
    assert readiness.guidance_messages


def test_event_readiness_endpoint_is_owner_scoped(client, monkeypatch) -> None:
    """Verify event readiness endpoint requires auth and owner scope."""
    import app.services.event_service as event_service
    from app.db.session import get_session_factory
    from app.models import Event, User

    unauthenticated = client.get(f"/api/v1/events/{uuid4()}/readiness")
    assert unauthenticated.status_code == 401

    setup_and_login(client)
    monkeypatch.setattr(event_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    event_response = client.post(
        "/api/v1/events",
        json={
            "name": "Spring 10K",
            "event_date": "2026-06-01",
            "event_type": "10k",
            "distance_m": 10000,
            "target_time_s": 3000,
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    readiness = client.get(f"/api/v1/events/{event_id}/readiness")

    assert readiness.status_code == 200
    body = readiness.json()
    assert body["event_id"] == event_id
    assert body["days_until_start"] == 33
    assert body["target_pace_s_per_km"] == 300

    with get_session_factory()() as session:
        other = User(email="other@example.com", timezone="Europe/Prague")
        session.add(other)
        session.flush()
        other_event = Event(
            user_id=other.id,
            name="Other race",
            event_date=date(2026, 6, 1),
            event_type="10k",
            distance_m=Decimal("10000"),
        )
        session.add(other_event)
        session.commit()
        other_event_id = other_event.id

    missing = client.get(f"/api/v1/events/{other_event_id}/readiness")

    assert missing.status_code == 404
