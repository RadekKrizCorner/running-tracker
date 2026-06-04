from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models import Activity, Gear, activity_gear


def get_gear_for_user(session: Session, user_id: UUID, gear_id: UUID) -> Gear:
    """Return gear scoped to a user."""
    gear = session.scalar(select(Gear).where(Gear.id == gear_id, Gear.user_id == user_id))
    if gear is None:
        raise AppException(404, "GEAR_NOT_FOUND", "Gear was not found")
    return gear


def calculate_gear_distance(session: Session, gear_id: UUID) -> float:
    """Return total distance assigned to gear."""
    total = session.scalar(
        select(func.coalesce(func.sum(Activity.distance_m), 0))
        .select_from(activity_gear.join(Activity, activity_gear.c.activity_id == Activity.id))
        .where(activity_gear.c.gear_id == gear_id)
    )
    return float(total or 0)


def gear_response(session: Session, gear: Gear) -> dict:
    """Return gear data with computed mileage fields."""
    total = calculate_gear_distance(session, gear.id)
    return {
        "id": gear.id,
        "type": gear.type,
        "name": gear.name,
        "brand": gear.brand,
        "model": gear.model,
        "start_date": gear.start_date,
        "retirement_distance_m": float(gear.retirement_distance_m),
        "retired_at": gear.retired_at,
        "notes": gear.notes,
        "total_distance_m": total,
        "retirement_warning": total >= float(gear.retirement_distance_m) * 0.9,
    }

