from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import AppException
from app.core.time import utc_now
from app.models import Activity, ActivityStream, ProviderConnection, User
from app.providers.strava.client import StravaClient, token_expiry_from_epoch, token_is_expired
from app.providers.strava.mapper import is_running_activity, map_strava_activity, map_strava_streams
from app.services.analytics_service import recompute_owner_weekly_metrics
from app.services.elevation_service import apply_elevation_correction_if_enabled
from app.services.notification_service import create_activity_notes_notification
from app.services.profile_service import recompute_activity_metrics

DEFAULT_HISTORY_LOOKBACK_DAYS = 730
ProgressReporter = Callable[[dict], None]


def upsert_strava_connection(session: Session, user: User, token_payload: dict) -> ProviderConnection:
    """Store encrypted Strava tokens for a user."""
    athlete = token_payload.get("athlete") or {}
    connection = session.scalar(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "strava",
        )
    )
    if connection is None:
        connection = ProviderConnection(user_id=user.id, provider="strava")
        session.add(connection)
    connection.provider_user_id = str(athlete.get("id")) if athlete.get("id") else None
    connection.scopes_granted = _scope_list(token_payload.get("scope"))
    connection.access_token_encrypted = encrypt_secret(token_payload["access_token"])
    connection.refresh_token_encrypted = encrypt_secret(token_payload["refresh_token"])
    connection.access_token_expires_at = token_expiry_from_epoch(token_payload.get("expires_at"))
    connection.status = "connected"
    connection.last_error = None
    session.commit()
    session.refresh(connection)
    return connection


def get_strava_connection(session: Session, user_id: UUID) -> ProviderConnection:
    """Return the active Strava connection for a user."""
    connection = session.scalar(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user_id,
            ProviderConnection.provider == "strava",
        )
    )
    if connection is None or connection.status != "connected":
        raise AppException(409, "STRAVA_NOT_CONNECTED", "Strava is not connected")
    return connection


def disconnect_strava(session: Session, user_id: UUID) -> ProviderConnection:
    """Mark Strava disconnected and remove local tokens."""
    connection = get_strava_connection(session, user_id)
    connection.status = "disconnected"
    connection.access_token_encrypted = None
    connection.refresh_token_encrypted = None
    connection.last_error = None
    session.commit()
    session.refresh(connection)
    return connection


def get_valid_strava_access_token(session: Session, connection: ProviderConnection) -> str:
    """Return a valid Strava access token, refreshing if needed."""
    if not connection.access_token_encrypted or not connection.refresh_token_encrypted:
        raise AppException(409, "STRAVA_NOT_CONNECTED", "Strava is not connected")
    if not token_is_expired(connection.access_token_expires_at):
        return decrypt_secret(connection.access_token_encrypted)
    refresh_token = decrypt_secret(connection.refresh_token_encrypted)
    payload = StravaClient().refresh_access_token(refresh_token)
    connection.access_token_encrypted = encrypt_secret(payload["access_token"])
    connection.refresh_token_encrypted = encrypt_secret(payload.get("refresh_token", refresh_token))
    connection.access_token_expires_at = token_expiry_from_epoch(payload.get("expires_at"))
    session.commit()
    return decrypt_secret(connection.access_token_encrypted)


def strava_sync_recent(
    session: Session,
    owner_id: UUID,
    progress: ProgressReporter | None = None,
) -> dict[str, int]:
    """Sync recent Strava activities for an owner."""
    history_start = datetime.now(UTC) - timedelta(days=DEFAULT_HISTORY_LOOKBACK_DAYS)
    oldest, newest = session.execute(
        select(func.min(Activity.start_time_utc), func.max(Activity.start_time_utc)).where(
            Activity.user_id == owner_id,
            Activity.provider == "strava",
        )
    ).one()
    oldest = _as_utc_datetime(oldest)
    newest = _as_utc_datetime(newest)
    if newest is None or oldest is None or oldest > history_start:
        after = history_start
    else:
        after = newest - timedelta(days=7)
    return strava_sync_history(session, owner_id, after_date=after, progress=progress)


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    """Return a datetime normalized to UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def strava_sync_history(
    session: Session,
    owner_id: UUID,
    after_date: datetime | None = None,
    before_date: datetime | None = None,
    progress: ProgressReporter | None = None,
) -> dict[str, int]:
    """Sync historical Strava activities for an owner."""
    connection = get_strava_connection(session, owner_id)
    token = get_valid_strava_access_token(session, connection)
    client = StravaClient(access_token=token)
    if after_date is None:
        after_date = datetime.now(UTC) - timedelta(days=DEFAULT_HISTORY_LOOKBACK_DAYS)
    started_at = _progress_timestamp()
    imported = 0
    skipped = 0
    streams_saved = 0
    last_error: str | None = None
    _report_progress(progress, "fetching", imported, skipped, streams_saved, started_at)
    try:
        activities = client.fetch_activities(after=after_date, before=before_date)
    except AppException as exc:
        _record_strava_sync_error(session, connection, exc)
        _report_progress(progress, "rate_limited" if exc.code == "STRAVA_RATE_LIMITED" else "failed", imported, skipped, streams_saved, started_at)
        if exc.code == "STRAVA_RATE_LIMITED":
            return {"imported": imported, "skipped": skipped, "streams": streams_saved}
        raise
    for payload in activities:
        current_activity = str(payload.get("name") or payload.get("id") or "Activity")
        _report_progress(progress, "importing", imported, skipped, streams_saved, started_at, current_activity)
        if not is_running_activity(payload):
            skipped += 1
            _report_progress(progress, "importing", imported, skipped, streams_saved, started_at, current_activity)
            continue
        detail_payload = payload
        try:
            detail = client.fetch_activity_details(str(payload.get("id")))
            detail_payload = {**payload, **detail}
        except AppException as exc:
            last_error = exc.detail
            if _should_stop_sync_for_error(session, connection, exc):
                break
        activity = upsert_activity_from_strava(session, owner_id, detail_payload)
        imported += 1
        current_activity = activity.name or current_activity
        try:
            stream_payload = client.fetch_activity_streams(activity.provider_activity_id or str(payload.get("id")))
            streams_saved += len(save_activity_streams(session, activity, stream_payload))
            apply_elevation_correction_if_enabled(session, activity)
            recompute_activity_metrics(session, activity)
            _report_progress(progress, "importing", imported, skipped, streams_saved, started_at, current_activity)
        except AppException as exc:
            last_error = exc.detail
            _report_progress(progress, "importing", imported, skipped, streams_saved, started_at, current_activity)
            if _should_stop_sync_for_error(session, connection, exc):
                break
    connection.last_sync_at = utc_now()
    connection.last_error = last_error
    session.commit()
    recompute_owner_weekly_metrics(session, owner_id)
    _report_progress(progress, "finished", imported, skipped, streams_saved, started_at)
    return {"imported": imported, "skipped": skipped, "streams": streams_saved}


def upsert_activity_from_strava(session: Session, owner_id: UUID, payload: dict) -> Activity:
    """Upsert one Strava activity idempotently."""
    mapped = map_strava_activity(payload)
    activity = session.scalar(
        select(Activity).where(
            Activity.provider == "strava",
            Activity.provider_activity_id == mapped["provider_activity_id"],
        )
    )
    created = activity is None
    if activity is None:
        activity = Activity(user_id=owner_id, **mapped)
        session.add(activity)
    else:
        if activity.user_id != owner_id:
            raise AppException(403, "FORBIDDEN", "Activity belongs to a different user")
        for key, value in mapped.items():
            setattr(activity, key, value)
    recompute_activity_metrics(session, activity)
    if created:
        session.flush()
        create_activity_notes_notification(session, activity)
    session.commit()
    session.refresh(activity)
    return activity


def save_activity_streams(session: Session, activity: Activity, stream_payload: dict) -> list[ActivityStream]:
    """Persist supported streams for an activity."""
    saved: list[ActivityStream] = []
    for mapped in map_strava_streams(stream_payload):
        stream = session.scalar(
            select(ActivityStream).where(
                ActivityStream.activity_id == activity.id,
                ActivityStream.stream_type == mapped["stream_type"],
            )
        )
        if stream is None:
            stream = ActivityStream(activity_id=activity.id, **mapped)
            session.add(stream)
        else:
            stream.data = mapped["data"]
            stream.sample_count = mapped["sample_count"]
        saved.append(stream)
    session.commit()
    return saved


def _record_strava_sync_error(session: Session, connection: ProviderConnection, exc: AppException) -> None:
    """Store Strava sync error state on a connection."""
    connection.last_error = exc.detail
    if exc.status_code in {401, 403}:
        connection.status = "unhealthy"
    session.commit()


def _should_stop_sync_for_error(session: Session, connection: ProviderConnection, exc: AppException) -> bool:
    """Return whether a Strava sync should stop for an API error."""
    _record_strava_sync_error(session, connection, exc)
    if exc.status_code in {401, 403}:
        raise exc
    return exc.code == "STRAVA_RATE_LIMITED"


def _scope_list(scope_value: str | list[str] | None) -> list[str]:
    """Normalize Strava scope values."""
    if scope_value is None:
        return []
    if isinstance(scope_value, list):
        return scope_value
    return [scope.strip() for scope in scope_value.split(",") if scope.strip()]


def _report_progress(
    progress: ProgressReporter | None,
    phase: str,
    imported: int,
    skipped: int,
    streams: int,
    started_at: str,
    current_activity: str | None = None,
) -> None:
    """Report safe Strava sync progress to an optional callback."""
    if progress is None:
        return
    progress(
        {
            "phase": phase,
            "imported": imported,
            "skipped": skipped,
            "streams": streams,
            "current_activity": current_activity,
            "started_at": started_at,
            "updated_at": _progress_timestamp(),
        }
    )


def _progress_timestamp() -> str:
    """Return an ISO timestamp for sync progress."""
    return utc_now().isoformat().replace("+00:00", "Z")
