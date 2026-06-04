from __future__ import annotations

from datetime import date


def test_plan_generator_creates_safe_general_fitness_plan() -> None:
    """Verify generated plans avoid consecutive hard days and include deload weeks."""
    from app.schemas.planning import PlanGenerateRequest
    from app.services.planning_service import generate_plan_preview

    request = PlanGenerateRequest(
        goal_type="general_fitness",
        start_date=date(2026, 5, 4),
        weeks=8,
        current_weekly_distance_m=24000,
        current_runs_per_week=4,
        preferred_run_days=[0, 2, 4, 6],
        long_run_day=6,
        experience_level="regular",
        injury_risk="medium",
    )

    preview = generate_plan_preview(request)
    hard_dates = {
        workout.scheduled_date
        for workout in preview.workouts
        if workout.target_intensity in {"hard", "race"}
    }

    assert preview.plan.title == "General fitness plan"
    assert len(preview.workouts) > 0
    assert all((hard_day.toordinal() + 1) not in {d.toordinal() for d in hard_dates} for hard_day in hard_dates)
    assert any(workout.title.startswith("Deload") for workout in preview.workouts)

