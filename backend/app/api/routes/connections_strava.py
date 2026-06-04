from __future__ import annotations

import secrets

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser, DbSession, SettingsDep, WritableUser
from app.core.config import Settings
from app.core.exceptions import AppException
from app.jobs.queue import STRAVA_SYNC_TASKS, enqueue_task, find_active_owner_job, get_job_status
from app.models import ProviderConnection
from app.providers.strava.client import StravaClient
from app.providers.strava.sync import disconnect_strava, get_strava_connection, upsert_strava_connection
from app.schemas.provider import StravaStatusResponse, SyncJobStatusResponse, SyncRequest, SyncResponse

router = APIRouter(prefix="/connections/strava", tags=["strava"])


@router.get("/start")
def start_strava_connection(
    user: WritableUser,
    settings: SettingsDep,
    force: bool = Query(default=False),
) -> RedirectResponse:
    """Start Strava OAuth for the authenticated owner."""
    _ = user
    state = secrets.token_urlsafe(32)
    url = StravaClient().build_authorization_url(state, force_approval=force)
    response = RedirectResponse(url)
    response.set_cookie(
        settings.oauth_state_cookie_name,
        state,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=600,
    )
    return response


@router.get("/callback")
def strava_callback(
    request: Request,
    session: DbSession,
    user: WritableUser,
    settings: SettingsDep,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """Handle the Strava OAuth callback."""
    expected_state = request.cookies.get(settings.oauth_state_cookie_name)
    if not state or not expected_state or state != expected_state:
        return _strava_result_redirect(settings, "invalid_state")
    if error:
        return _strava_result_redirect(settings, "denied")
    if not code:
        return _strava_result_redirect(settings, "error")
    try:
        tokens = StravaClient().exchange_code_for_tokens(code)
    except AppException:
        return _strava_result_redirect(settings, "error")
    upsert_strava_connection(session, user, tokens)
    return _strava_result_redirect(settings, "connected")


@router.get("/status", response_model=StravaStatusResponse)
def strava_status(session: DbSession, user: CurrentUser, settings: SettingsDep) -> StravaStatusResponse:
    """Return Strava connection status for the owner."""
    connection = session.query(ProviderConnection).filter_by(user_id=user.id, provider="strava").one_or_none()
    active_job_id = _active_strava_sync_job_id(str(user.id))
    if connection is None:
        return StravaStatusResponse(
            connected=False,
            status="disconnected",
            missing_scopes=settings.strava_scope_list,
            active_job_id=active_job_id,
        )
    granted = connection.scopes_granted or []
    missing = [scope for scope in settings.strava_scope_list if scope not in granted]
    return StravaStatusResponse(
        connected=connection.status == "connected",
        status=connection.status,
        provider_user_id=connection.provider_user_id,
        scopes_granted=granted,
        missing_scopes=missing,
        access_token_expires_at=connection.access_token_expires_at,
        last_sync_at=connection.last_sync_at,
        last_error=connection.last_error,
        active_job_id=active_job_id,
    )


@router.post("/sync", response_model=SyncResponse)
def sync_strava(payload: SyncRequest, session: DbSession, user: WritableUser) -> SyncResponse:
    """Queue a Strava sync for the owner."""
    get_strava_connection(session, user.id)
    try:
        active_job_id = find_active_owner_job(str(user.id), STRAVA_SYNC_TASKS)
        if active_job_id is not None:
            return SyncResponse(
                status="queued",
                job_id=active_job_id,
                detail="Strava sync already queued or running",
            )
        if payload.mode == "history":
            job_id = enqueue_task("app.jobs.tasks.strava_sync_history_task", str(user.id), payload.after_date, payload.before_date)
        else:
            job_id = enqueue_task("app.jobs.tasks.strava_sync_recent_task", str(user.id))
        return SyncResponse(status="queued", job_id=job_id, detail="Strava sync queued")
    except Exception:
        return SyncResponse(status="not_queued", job_id=None, detail="Redis was unavailable; start the worker and retry")


@router.get("/sync/{job_id}", response_model=SyncJobStatusResponse)
def strava_sync_job_status(job_id: str, user: CurrentUser) -> SyncJobStatusResponse:
    """Return status for a queued Strava sync job."""
    return SyncJobStatusResponse(**get_job_status(job_id, str(user.id)))


@router.post("/disconnect", response_model=StravaStatusResponse)
def disconnect_strava_endpoint(session: DbSession, user: WritableUser, settings: SettingsDep) -> StravaStatusResponse:
    """Disconnect Strava and clear local tokens."""
    connection = disconnect_strava(session, user.id)
    return StravaStatusResponse(
        connected=False,
        status=connection.status,
        provider_user_id=connection.provider_user_id,
        scopes_granted=[],
        missing_scopes=settings.strava_scope_list,
        active_job_id=None,
    )


def _active_strava_sync_job_id(owner_id: str) -> str | None:
    """Return an active Strava sync job id if Redis is available."""
    try:
        return find_active_owner_job(owner_id, STRAVA_SYNC_TASKS)
    except Exception:
        return None


def _strava_result_redirect(settings: Settings, result: str) -> RedirectResponse:
    """Return a frontend redirect for a Strava OAuth result."""
    redirect = RedirectResponse(f"{settings.frontend_url}/settings/connections?strava={result}")
    redirect.delete_cookie(settings.oauth_state_cookie_name)
    return redirect
