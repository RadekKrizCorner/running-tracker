from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select


def test_cleanup_seed_data_removes_only_dummy_records(client) -> None:
    """Verify seed cleanup removes sample records without touching synced data."""
    from app.db.cleanup_seed import cleanup_seed_data
    from app.db.session import get_session_factory
    from app.models import Activity, Gear, PlannedWorkout, User

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="seed-1-1",
                    sport_type="Run",
                    name="Seed run",
                    start_time_utc=datetime.now(UTC),
                    distance_m=Decimal("5000"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="real-1",
                    sport_type="Run",
                    name="Real Strava run",
                    start_time_utc=datetime.now(UTC),
                    distance_m=Decimal("8000"),
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date.today() + timedelta(days=1),
                    workout_type="easy",
                    title="Easy run",
                    target_duration_s=2400,
                    target_distance_m=Decimal("6000"),
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date.today() + timedelta(days=1),
                    workout_type="tempo",
                    title="My real session",
                    target_duration_s=3600,
                    target_distance_m=Decimal("10000"),
                    target_intensity="moderate",
                    status="planned",
                ),
                Gear(
                    user_id=owner.id,
                    name="Daily Trainer",
                    brand="Sample",
                    model="Cruise",
                    start_date=date.today(),
                ),
                Gear(
                    user_id=owner.id,
                    name="Real Shoes",
                    brand="Saucony",
                    model="Ride",
                    start_date=date.today(),
                ),
            ]
        )
        session.commit()

        result = cleanup_seed_data(session, owner.id)

        assert result == {"activities": 1, "planned_workouts": 1, "gear": 1}
        remaining_names = {activity.name for activity in session.scalars(select(Activity))}
        assert remaining_names == {"Real Strava run"}
        remaining_workouts = {workout.title for workout in session.scalars(select(PlannedWorkout))}
        assert remaining_workouts == {"My real session"}
        remaining_gear = {gear.name for gear in session.scalars(select(Gear))}
        assert remaining_gear == {"Real Shoes"}
