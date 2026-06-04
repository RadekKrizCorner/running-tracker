from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.core.time import utc_now
from app.models import Activity, Notification, User, UserPreference

RECENT_ACTIVITY_NOTE_REMINDER_DAYS = 30


def list_notifications(session: Session, user: User, unread_only: bool = False, limit: int = 20) -> list[Notification]:
    """Return owner notifications newest first."""
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    statement = statement.order_by(Notification.created_at.desc()).limit(limit)
    return list(session.scalars(statement))


def unread_notification_count(session: Session, user: User) -> int:
    """Return unread notification count for an owner."""
    return int(
        session.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )


def get_notification_for_user(session: Session, user: User, notification_id: UUID) -> Notification:
    """Return one owner notification."""
    notification = session.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if notification is None:
        raise AppException(404, "NOTIFICATION_NOT_FOUND", "Notification was not found")
    return notification


def mark_notification_read(session: Session, user: User, notification_id: UUID) -> Notification:
    """Mark one owner notification as read."""
    notification = get_notification_for_user(session, user, notification_id)
    if notification.read_at is None:
        notification.read_at = utc_now()
        session.commit()
        session.refresh(notification)
    return notification


def mark_all_notifications_read(session: Session, user: User) -> int:
    """Mark all owner notifications as read and return count changed."""
    notifications = list(session.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))))
    read_at = utc_now()
    for notification in notifications:
        notification.read_at = read_at
    session.commit()
    return len(notifications)


def delete_notification(session: Session, user: User, notification_id: UUID) -> None:
    """Delete one owner notification."""
    notification = get_notification_for_user(session, user, notification_id)
    session.delete(notification)
    session.commit()


def create_activity_notes_notification(session: Session, activity: Activity) -> Notification | None:
    """Create a deduplicated reminder to add notes to a synced activity."""
    if not should_create_activity_notes_notification(activity):
        return None
    source_id = str(activity.id)
    existing = session.scalar(
        select(Notification).where(
            Notification.user_id == activity.user_id,
            Notification.type == "activity_notes_reminder",
            Notification.source_type == "activity",
            Notification.source_id == source_id,
        )
    )
    if existing is not None:
        return existing
    locale = _notification_locale(session, activity.user_id)
    title, body = _activity_notes_copy(locale, activity.name)
    notification = Notification(
        user_id=activity.user_id,
        type="activity_notes_reminder",
        title=title,
        body=body,
        action_url=f"/activities/{activity.id}?focus=notes",
        action_label=_activity_notes_action_label(locale),
        source_type="activity",
        source_id=source_id,
    )
    session.add(notification)
    return notification


def should_create_activity_notes_notification(activity: Activity, now: datetime | None = None) -> bool:
    """Return whether a synced activity should prompt for fresh notes."""
    reference_time = now or utc_now()
    activity_time = activity.start_time_utc
    if activity_time.tzinfo is None:
        activity_time = activity_time.replace(tzinfo=UTC)
    cutoff = reference_time - timedelta(days=RECENT_ACTIVITY_NOTE_REMINDER_DAYS)
    return activity_time >= cutoff


def _notification_locale(session: Session, user_id: UUID) -> str:
    """Return owner locale for notification copy."""
    locale = session.scalar(select(UserPreference.locale).where(UserPreference.user_id == user_id))
    return "en-US" if locale and locale.startswith("en") else "cs-CZ"


def _activity_notes_copy(locale: str, activity_name: str | None) -> tuple[str, str]:
    """Return localized activity notes notification copy."""
    name = activity_name or ("your run" if locale.startswith("en") else "poslednímu běhu")
    if locale.startswith("en"):
        return (
            f"Add notes to {name}",
            f"{name} was synced. Add notes while it is fresh.",
        )
    if activity_name:
        return (
            f"Doplň poznámky k běhu {name}",
            f"{name} se synchronizoval. Doplň poznámky, dokud je běh čerstvý.",
        )
    return (
        "Doplň poznámky k poslednímu běhu",
        "Běh se synchronizoval. Doplň poznámky, dokud je čerstvý.",
    )


def _activity_notes_action_label(locale: str) -> str:
    """Return localized activity notes notification action label."""
    return "Add notes" if locale.startswith("en") else "Doplnit poznámky"
