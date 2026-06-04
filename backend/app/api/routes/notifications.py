from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import NotificationRead, NotificationSummary
from app.services.notification_service import (
    delete_notification,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    unread_notification_count,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def get_notifications(
    session: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[NotificationRead]:
    """Return owner notifications."""
    return [NotificationRead.model_validate(notification) for notification in list_notifications(session, user, unread_only, limit)]


@router.get("/summary", response_model=NotificationSummary)
def get_notification_summary(session: DbSession, user: CurrentUser) -> NotificationSummary:
    """Return owner notification summary counters."""
    return NotificationSummary(unread_count=unread_notification_count(session, user))


@router.post("/{notification_id}/read", response_model=NotificationRead)
def post_notification_read(notification_id: UUID, session: DbSession, user: CurrentUser) -> NotificationRead:
    """Mark one notification as read."""
    return NotificationRead.model_validate(mark_notification_read(session, user, notification_id))


@router.post("/read-all")
def post_notifications_read_all(session: DbSession, user: CurrentUser) -> dict[str, int]:
    """Mark all notifications as read."""
    return {"updated": mark_all_notifications_read(session, user)}


@router.delete("/{notification_id}", status_code=204)
def delete_notification_endpoint(notification_id: UUID, session: DbSession, user: CurrentUser) -> Response:
    """Delete one notification."""
    delete_notification(session, user, notification_id)
    return Response(status_code=204)
