from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, DbSession
from app.schemas.event import EventCreate, EventPlanningGuidance, EventRead, EventUpdate
from app.services.event_service import (
    create_event,
    delete_event,
    event_planning_guidance,
    event_to_read,
    get_event_for_user,
    list_events,
    update_event,
)

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def get_events(session: DbSession, user: CurrentUser) -> list[EventRead]:
    """Return owner events."""
    return list_events(session, user)


@router.post("", response_model=EventRead)
def post_event(payload: EventCreate, session: DbSession, user: CurrentUser) -> EventRead:
    """Create an owner event."""
    event = create_event(session, user, payload)
    return event_to_read(session, user, event)


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: UUID, session: DbSession, user: CurrentUser) -> EventRead:
    """Return one owner event."""
    event = get_event_for_user(session, user.id, event_id)
    return event_to_read(session, user, event)


@router.get("/{event_id}/planning-guidance", response_model=EventPlanningGuidance)
def get_event_planning_guidance(event_id: UUID, session: DbSession, user: CurrentUser) -> EventPlanningGuidance:
    """Return transparent planning guidance for one owner event."""
    event = get_event_for_user(session, user.id, event_id)
    return event_planning_guidance(session, user, event)


@router.patch("/{event_id}", response_model=EventRead)
def patch_event(event_id: UUID, payload: EventUpdate, session: DbSession, user: CurrentUser) -> EventRead:
    """Update one owner event."""
    event = get_event_for_user(session, user.id, event_id)
    return event_to_read(session, user, update_event(session, event, payload))


@router.delete("/{event_id}", status_code=204)
def remove_event(event_id: UUID, session: DbSession, user: CurrentUser) -> Response:
    """Delete one owner event."""
    event = get_event_for_user(session, user.id, event_id)
    delete_event(session, event)
    return Response(status_code=204)
