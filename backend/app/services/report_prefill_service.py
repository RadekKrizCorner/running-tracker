from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import start_of_day, week_start
from app.models import Activity, PlannedWorkout, TrainingPlan, User
from app.services.analytics_service import RUNNING_TYPES
from app.services.planning_service import deduplicate_planned_workouts_by_session


def build_weekly_report_prefill(session: Session, user: User, selected_week_start: date) -> dict[str, Any]:
    """Build editable Instagram report values from one owner week."""
    report_week_start = week_start(selected_week_start)
    report_week_end = report_week_start + timedelta(days=6)
    plan = _covering_training_plan(session, user.id, report_week_start)
    workouts = _planned_workouts(session, user.id, report_week_start, report_week_end)
    activities = _running_activities(session, user.id, user.timezone, report_week_start, report_week_end)

    planned_distance_m = _sum_decimal(workout.target_distance_m for workout in workouts)
    completed_distance_m = _sum_decimal(activity.distance_m for activity in activities)
    completed_time_s = sum(activity.moving_time_s or 0 for activity in activities)
    planned_sessions = sum(1 for workout in workouts if workout.workout_type != "rest")
    completed_sessions = len(activities)
    longest_run_m = max((Decimal(str(activity.distance_m or 0)) for activity in activities), default=Decimal("0"))
    completion_percent = _completion_percent(completed_distance_m, planned_distance_m)
    volume = _volume_values(planned_distance_m, completed_distance_m)

    return {
        "program": _program_label(plan),
        "title": "Týdenní běžecký report",
        "week": _week_label(plan, report_week_start),
        "main_distance": _format_km_value(completed_distance_m),
        "main_unit": "km",
        "main_label": "naběháno tento týden",
        "completion_percent": completion_percent,
        "stats": {
            "runs": str(completed_sessions),
            "time": _format_duration(completed_time_s),
            "plan_vs_actual": f"{_format_km_value(planned_distance_m)} / {_format_km_value(completed_distance_m)} km",
            "longest_run": _format_km(longest_run_m),
            "avg_pace": _format_pace(completed_time_s, completed_distance_m),
            "training_adherence": f"{completed_sessions}/{planned_sessions}",
        },
        "volume": volume,
        "summary_lines": _summary_lines(completed_sessions, completion_percent, volume["difference"]),
        "went_well": _went_well_lines(completed_sessions, longest_run_m),
        "focus_next": _focus_next_lines(volume["difference"]),
        "footer": ["Běžecký plán", "konzistence", "vytrvalost", "maraton 2026"],
    }


def _covering_training_plan(session: Session, user_id: UUID, report_week_start: date) -> TrainingPlan | None:
    """Return the owner plan covering the report week."""
    return session.scalar(
        select(TrainingPlan)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.start_date <= report_week_start,
            TrainingPlan.end_date >= report_week_start,
        )
        .order_by((TrainingPlan.status == "active").desc(), TrainingPlan.start_date.desc())
        .limit(1)
    )


def _planned_workouts(
    session: Session,
    user_id: UUID,
    report_week_start: date,
    report_week_end: date,
) -> list[PlannedWorkout]:
    """Return owner planned workouts for the report week."""
    workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= report_week_start,
                PlannedWorkout.scheduled_date <= report_week_end,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    return deduplicate_planned_workouts_by_session(workouts)


def _running_activities(
    session: Session,
    user_id: UUID,
    timezone: str,
    report_week_start: date,
    report_week_end: date,
) -> list[Activity]:
    """Return owner running activities for the report week."""
    return list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user_id,
                Activity.sport_type.in_(RUNNING_TYPES),
                Activity.start_time_utc >= start_of_day(report_week_start, timezone),
                Activity.start_time_utc < start_of_day(report_week_end + timedelta(days=1), timezone),
            )
            .order_by(Activity.start_time_utc)
        )
    )


def _sum_decimal(values) -> Decimal:
    """Sum nullable decimal-like values."""
    return sum((value or Decimal("0") for value in values), Decimal("0"))


def _program_label(plan: TrainingPlan | None) -> str:
    """Return the report program label."""
    return plan.title.upper() if plan is not None else "BĚŽECKÁ PŘÍPRAVA"


def _week_label(plan: TrainingPlan | None, report_week_start: date) -> str:
    """Return the report week label."""
    if plan is None:
        return f"Týden {report_week_start.isocalendar().week}"
    plan_week_start = week_start(plan.start_date)
    week_number = ((report_week_start - plan_week_start).days // 7) + 1
    return f"Týden {max(1, week_number)}"


def _completion_percent(completed_distance_m: Decimal, planned_distance_m: Decimal) -> int:
    """Return rounded distance completion percent."""
    if planned_distance_m <= 0:
        return 0
    return round(float(completed_distance_m / planned_distance_m) * 100)


def _volume_values(planned_distance_m: Decimal, completed_distance_m: Decimal) -> dict[str, float]:
    """Return planned and actual volume values in kilometers."""
    planned = _km_number(planned_distance_m)
    actual = _km_number(completed_distance_m)
    return {"planned": planned, "actual": actual, "difference": round(actual - planned, 1)}


def _km_number(distance_m: Decimal) -> float:
    """Return meters as rounded kilometers."""
    return round(float(distance_m) / 1000, 1)


def _format_km(distance_m: Decimal) -> str:
    """Format meters as Czech kilometers with unit."""
    return f"{_format_km_value(distance_m)} km"


def _format_km_value(distance_m: Decimal) -> str:
    """Format meters as Czech kilometers without unit."""
    return f"{float(distance_m) / 1000:.1f}".replace(".", ",")


def _format_duration(seconds: int) -> str:
    """Format seconds as hours and minutes."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours} h {minutes:02d} min"


def _format_pace(seconds: int, distance_m: Decimal) -> str:
    """Format average pace as minutes per kilometer."""
    distance_km = float(distance_m) / 1000
    if seconds <= 0 or distance_km <= 0:
        return "0:00 min/km"
    pace_seconds = round(seconds / distance_km)
    minutes = pace_seconds // 60
    remaining_seconds = pace_seconds % 60
    return f"{minutes}:{remaining_seconds:02d} min/km"


def _summary_lines(completed_sessions: int, completion_percent: int, volume_difference: float) -> list[str]:
    """Return summary lines for the report story."""
    if completed_sessions == 0:
        return [
            "Týden zatím čeká na první zaznamenaný běh.",
            "Plán je připravený pro další tréninkový blok.",
        ]
    if completion_percent >= 90:
        return [
            "Silný týden s velmi dobrým plněním plánu.",
            "Objem a pravidelnost dobře podporují maratonskou přípravu.",
        ]
    if volume_difference < 0:
        return [
            f"Solidní týden s {completed_sessions} zaznamenanými běhy.",
            "Objem byl nižší než plán, ale tréninky proběhly pravidelně.",
        ]
    return [
        f"Solidní týden s {completed_sessions} zaznamenanými běhy.",
        "Skutečný objem drží krok s plánem.",
    ]


def _went_well_lines(completed_sessions: int, longest_run_m: Decimal) -> list[str]:
    """Return positive report lines."""
    lines = [
        f"{completed_sessions} běhy dokončené v tomto týdnu",
        "pravidelný pohyb a dobrý základ týdne",
    ]
    if longest_run_m > 0:
        lines.append("nejdelší běh dobře podpořil vytrvalost")
    return lines


def _focus_next_lines(volume_difference: float) -> list[str]:
    """Return next-focus report lines."""
    if volume_difference < 0:
        return [
            "doplnit chybějící kilometry bez zbytečného hrocení",
            "držet pravidelnost po celý týden",
            "postupně navýšit objem směrem k plánu",
        ]
    return [
        "udržet konzistenci i v dalším týdnu",
        "hlídat easy intenzitu a regeneraci",
        "navázat dalším dlouhým během",
    ]
