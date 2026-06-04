from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import Gear
from app.schemas.gear import GearCreate, GearRead, GearUpdate
from app.services.gear_service import gear_response, get_gear_for_user

router = APIRouter(prefix="/gear", tags=["gear"])


@router.get("", response_model=list[GearRead])
def list_gear(session: DbSession, user: CurrentUser) -> list[GearRead]:
    """List owner gear."""
    gear_items = session.scalars(select(Gear).where(Gear.user_id == user.id).order_by(Gear.created_at.desc())).all()
    return [GearRead.model_validate(gear_response(session, item)) for item in gear_items]


@router.post("", response_model=GearRead)
def create_gear(payload: GearCreate, session: DbSession, user: CurrentUser) -> GearRead:
    """Create gear."""
    gear = Gear(user_id=user.id, **payload.model_dump())
    session.add(gear)
    session.commit()
    session.refresh(gear)
    return GearRead.model_validate(gear_response(session, gear))


@router.get("/{gear_id}", response_model=GearRead)
def get_gear(gear_id: UUID, session: DbSession, user: CurrentUser) -> GearRead:
    """Return one gear item."""
    return GearRead.model_validate(gear_response(session, get_gear_for_user(session, user.id, gear_id)))


@router.patch("/{gear_id}", response_model=GearRead)
def update_gear(gear_id: UUID, payload: GearUpdate, session: DbSession, user: CurrentUser) -> GearRead:
    """Update gear."""
    gear = get_gear_for_user(session, user.id, gear_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(gear, key, value)
    session.commit()
    session.refresh(gear)
    return GearRead.model_validate(gear_response(session, gear))


@router.delete("/{gear_id}", status_code=204)
def delete_gear(gear_id: UUID, session: DbSession, user: CurrentUser) -> Response:
    """Delete gear."""
    gear = get_gear_for_user(session, user.id, gear_id)
    session.delete(gear)
    session.commit()
    return Response(status_code=204)


@router.get("/{gear_id}/activities")
def gear_activities(gear_id: UUID, session: DbSession, user: CurrentUser) -> list[dict]:
    """Return activities assigned to gear."""
    gear = get_gear_for_user(session, user.id, gear_id)
    return [
        {
            "id": str(activity.id),
            "name": activity.name,
            "start_time_utc": activity.start_time_utc.isoformat(),
            "distance_m": float(activity.distance_m or 0),
        }
        for activity in gear.activities
    ]

