from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.exceptions import AppException
from app.core.security import decode_session_token
from app.db.session import get_session
from app.models import User

DbSession = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_current_user(
    session: DbSession,
    settings: SettingsDep,
    session_cookie: str | None = Cookie(default=None, alias="session"),
) -> User:
    """Return the authenticated owner from the session cookie."""
    _ = settings
    if session_cookie is None:
        raise AppException(401, "UNAUTHENTICATED", "Authentication is required")
    user_id = decode_session_token(session_cookie)
    user = session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise AppException(401, "UNAUTHENTICATED", "Authentication is required")
    return user


def get_writable_user(user: "CurrentUser") -> User:
    """Return the authenticated user if the account can mutate data."""
    if user.is_demo:
        raise AppException(403, "DEMO_READ_ONLY", "Demo account is read-only")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
WritableUser = Annotated[User, Depends(get_writable_user)]
