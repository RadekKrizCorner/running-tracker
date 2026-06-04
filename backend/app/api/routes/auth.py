from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, DbSession, SettingsDep, WritableUser
from app.core.security import create_session_token
from app.schemas.auth import AuthOptionsRead, ChangePasswordRequest, LoginRequest, SetupOwnerRequest, UserRead
from app.services.auth_service import authenticate_demo_account, authenticate_owner, change_password, setup_owner

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/options", response_model=AuthOptionsRead)
def auth_options_endpoint(settings: SettingsDep) -> AuthOptionsRead:
    """Return public authentication options."""
    demo_enabled = (
        settings.demo_account_enabled
        and bool(settings.demo_account_email.strip())
        and bool(settings.demo_account_password.strip())
    )
    return AuthOptionsRead(demo_enabled=demo_enabled)


@router.post("/setup-owner", response_model=UserRead)
def setup_owner_endpoint(payload: SetupOwnerRequest, response: Response, session: DbSession, settings: SettingsDep) -> UserRead:
    """Set the owner password and create a session."""
    user = setup_owner(session, payload.email, payload.password)
    token = create_session_token(user.id)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_max_age_seconds,
    )
    return UserRead.model_validate(user)


@router.post("/login", response_model=UserRead)
def login_endpoint(payload: LoginRequest, response: Response, session: DbSession, settings: SettingsDep) -> UserRead:
    """Log in the owner and set the session cookie."""
    user = authenticate_owner(session, payload.email, payload.password)
    _set_session_cookie(response, user.id, settings)
    return UserRead.model_validate(user)


@router.post("/demo-login", response_model=UserRead)
def demo_login_endpoint(response: Response, session: DbSession, settings: SettingsDep) -> UserRead:
    """Log in to the configured portfolio demo account."""
    user = authenticate_demo_account(session, settings)
    _set_session_cookie(response, user.id, settings)
    return UserRead.model_validate(user)


@router.post("/logout", status_code=204)
def logout_endpoint(settings: SettingsDep) -> Response:
    """Clear the session cookie."""
    response = Response(status_code=204)
    response.delete_cookie(settings.session_cookie_name)
    return response


@router.get("/me", response_model=UserRead)
def me_endpoint(user: CurrentUser) -> UserRead:
    """Return the authenticated owner."""
    return UserRead.model_validate(user)


@router.post("/change-password", status_code=204)
def change_password_endpoint(payload: ChangePasswordRequest, session: DbSession, user: WritableUser) -> Response:
    """Change the authenticated owner password."""
    change_password(session, user, payload.current_password, payload.new_password)
    return Response(status_code=204)


def _set_session_cookie(response: Response, user_id: UUID, settings: SettingsDep) -> None:
    """Set the signed session cookie for a user."""
    token = create_session_token(user_id)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_max_age_seconds,
    )
