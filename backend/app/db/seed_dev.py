from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.intensity import classify_intensity
from app.analytics.load import calculate_training_load
from app.core.security import hash_password
from app.db.init_db import create_database, ensure_owner
from app.db.session import get_session_factory
from app.models import Activity, ActivityStream, Gear, PlannedWorkout
from app.services.analytics_service import recompute_owner_weekly_metrics


def main() -> None:
    """Seed local development data."""
    create_database()
    with get_session_factory()() as session:
        user = ensure_owner(session)
        if user.password_hash is None:
            user.password_hash = hash_password("passwordpassword")
        shoe_one = _get_or_create_gear(
            session,
            user.id,
            "Daily Trainer",
            "Sample",
            "Cruise",
            date.today() - timedelta(days=120),
        )
        shoe_two = _get_or_create_gear(
            session,
            user.id,
            "Fast Shoe",
            "Sample",
            "Tempo",
            date.today() - timedelta(days=45),
        )
        session.flush()
        start = datetime.now(UTC) - timedelta(weeks=12)
        for week in range(12):
            for run in range(3 + (week % 2)):
                start_time = start + timedelta(weeks=week, days=run * 2, hours=7)
                distance = Decimal(str(5000 + week * 250 + run * 800))
                moving = int(float(distance) / 2.7)
                rpe = 3 if run < 2 else 5
                load = calculate_training_load(moving, None, None, rpe)
                existing = session.scalar(
                    select(Activity).where(
                        Activity.provider == "manual",
                        Activity.provider_activity_id == f"seed-{week}-{run}",
                    )
                )
                if existing is not None:
                    continue
                activity = Activity(
                    user_id=user.id,
                    provider="manual",
                    provider_activity_id=f"seed-{week}-{run}",
                    sport_type="Run",
                    workout_type="easy" if rpe <= 4 else "tempo",
                    name=f"Seed run {week + 1}.{run + 1}",
                    start_time_utc=start_time,
                    start_time_local=start_time.replace(tzinfo=None),
                    timezone=user.timezone,
                    distance_m=distance,
                    moving_time_s=moving,
                    elapsed_time_s=moving + 120,
                    elevation_gain_m=Decimal(str(30 + run * 12)),
                    average_hr=Decimal(str(135 + rpe * 4)),
                    computed_load=Decimal(str(load.load)),
                    load_source=load.source,
                    intensity_class=classify_intensity(moving, None, None, rpe, None),
                )
                activity.gear.append(shoe_one if run % 2 == 0 else shoe_two)
                session.add(activity)
                session.flush()
                session.add(
                    ActivityStream(
                        activity_id=activity.id,
                        stream_type="heartrate",
                        data=[130 + rpe * 3 for _ in range(60)],
                        sample_count=60,
                    )
                )
        for offset in range(14):
            existing_workout = session.scalar(
                select(PlannedWorkout).where(
                    PlannedWorkout.user_id == user.id,
                    PlannedWorkout.scheduled_date == date.today() + timedelta(days=offset),
                    PlannedWorkout.title == ("Easy run" if offset % 6 else "Long run"),
                )
            )
            if existing_workout is not None:
                continue
            session.add(
                PlannedWorkout(
                    user_id=user.id,
                    scheduled_date=date.today() + timedelta(days=offset),
                    workout_type="easy" if offset % 6 else "long",
                    title="Easy run" if offset % 6 else "Long run",
                    target_duration_s=2400 if offset % 6 else 5400,
                    target_distance_m=6000 if offset % 6 else 14000,
                    target_intensity="easy",
                    status="planned",
                )
            )
        session.commit()
        recompute_owner_weekly_metrics(session, user.id)
    print("Seeded owner password: passwordpassword")


def _get_or_create_gear(
    session: Session,
    user_id: UUID,
    name: str,
    brand: str,
    model: str,
    start_date: date,
) -> Gear:
    """Return existing seed gear or create it."""
    gear = session.scalar(select(Gear).where(Gear.user_id == user_id, Gear.name == name))
    if gear is not None:
        return gear
    gear = Gear(user_id=user_id, name=name, brand=brand, model=model, start_date=start_date)
    session.add(gear)
    return gear


if __name__ == "__main__":
    main()
