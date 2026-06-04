from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import AppException
from app.models import Activity, ActivityNote, Gear


def get_activity_for_user(session: Session, user_id: UUID, activity_id: UUID) -> Activity:
    """Return an activity scoped to a user."""
    activity = session.scalar(
        select(Activity)
        .options(selectinload(Activity.gear), selectinload(Activity.note))
        .where(Activity.id == activity_id, Activity.user_id == user_id)
    )
    if activity is None:
        raise AppException(404, "ACTIVITY_NOT_FOUND", "Activity was not found")
    return activity


def save_note(session: Session, activity: Activity, payload: dict) -> ActivityNote:
    """Create or update an activity note."""
    note = activity.note
    if note is None:
        note = ActivityNote(activity_id=activity.id, user_id=activity.user_id)
        session.add(note)
    for key, value in payload.items():
        setattr(note, key, value)
    if "rpe" in payload:
        activity.perceived_effort = note.rpe
        from app.services.profile_service import recompute_activity_metrics

        recompute_activity_metrics(session, activity)
    session.commit()
    session.refresh(note)
    return note


def attach_gear(session: Session, activity: Activity, gear: Gear) -> Activity:
    """Attach gear to an activity."""
    if gear not in activity.gear:
        activity.gear.append(gear)
    session.commit()
    session.refresh(activity)
    return activity


def detach_gear(session: Session, activity: Activity, gear: Gear) -> Activity:
    """Detach gear from an activity."""
    if gear in activity.gear:
        activity.gear.remove(gear)
    session.commit()
    session.refresh(activity)
    return activity
