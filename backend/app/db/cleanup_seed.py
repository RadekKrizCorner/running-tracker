from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.init_db import ensure_owner
from app.db.session import get_session_factory
from app.models import Activity, Gear, PlannedWorkout
from app.services.analytics_service import recompute_owner_weekly_metrics


def cleanup_seed_data(session: Session, owner_id: UUID) -> dict[str, int]:
    """Remove deterministic development seed records for one owner."""
    seed_activities = list(
        session.scalars(
            select(Activity).where(
                Activity.user_id == owner_id,
                Activity.provider == "manual",
                Activity.provider_activity_id.like("seed-%"),
            )
        )
    )
    seed_workouts = _find_seed_planned_workouts(session, owner_id)
    seed_gear = list(
        session.scalars(
            select(Gear).where(
                Gear.user_id == owner_id,
                Gear.brand == "Sample",
                Gear.model.in_(("Cruise", "Tempo")),
                Gear.name.in_(("Daily Trainer", "Fast Shoe")),
            )
        )
    )

    for activity in seed_activities:
        session.delete(activity)
    for workout in seed_workouts:
        session.delete(workout)
    for gear in seed_gear:
        session.delete(gear)

    result = {
        "activities": len(seed_activities),
        "planned_workouts": len(seed_workouts),
        "gear": len(seed_gear),
    }
    session.commit()
    recompute_owner_weekly_metrics(session, owner_id)
    return result


def _find_seed_planned_workouts(session: Session, owner_id: UUID) -> list[PlannedWorkout]:
    """Return planned workouts that match the development seed pattern."""
    today = date.today()
    seed_window_end = today + timedelta(days=13)
    return list(
        session.scalars(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == owner_id,
                PlannedWorkout.plan_id.is_(None),
                PlannedWorkout.completed_activity_id.is_(None),
                PlannedWorkout.status == "planned",
                PlannedWorkout.scheduled_date >= today,
                PlannedWorkout.scheduled_date <= seed_window_end,
                PlannedWorkout.target_intensity == "easy",
                (
                    (
                        (PlannedWorkout.title == "Easy run")
                        & (PlannedWorkout.workout_type == "easy")
                        & (PlannedWorkout.target_duration_s == 2400)
                        & (PlannedWorkout.target_distance_m == 6000)
                    )
                    | (
                        (PlannedWorkout.title == "Long run")
                        & (PlannedWorkout.workout_type == "long")
                        & (PlannedWorkout.target_duration_s == 5400)
                        & (PlannedWorkout.target_distance_m == 14000)
                    )
                ),
            )
        )
    )


def main() -> None:
    """Clean seed records for the configured owner."""
    with get_session_factory()() as session:
        owner = ensure_owner(session)
        result = cleanup_seed_data(session, owner.id)
    print(
        "Removed seed records: "
        f"{result['activities']} activities, "
        f"{result['planned_workouts']} planned workouts, "
        f"{result['gear']} gear items"
    )


if __name__ == "__main__":
    main()
