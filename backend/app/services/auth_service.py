from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppException
from app.core.security import hash_password, verify_password
from app.models import User


def setup_owner(session: Session, email: str, password: str) -> User:
    """Create or finish configuring the single owner account."""
    settings = get_settings()
    if email.lower() != settings.owner_email.lower():
        raise AppException(403, "FORBIDDEN", "Only the configured owner email can be used")
    user = session.scalar(select(User).order_by(User.created_at).limit(1))
    if user is None:
        user = User(email=email.lower(), display_name="Runner")
        session.add(user)
        session.flush()
    if user.password_hash:
        raise AppException(409, "OWNER_ALREADY_CONFIGURED", "Owner password is already configured")
    user.email = email.lower()
    user.password_hash = hash_password(password)
    session.commit()
    session.refresh(user)
    return user


def authenticate_owner(session: Session, email: str, password: str) -> User:
    """Authenticate the owner with email and password."""
    user = session.scalar(select(User).where(User.email == email.lower()))
    if user is None or not verify_password(password, user.password_hash):
        raise AppException(401, "UNAUTHENTICATED", "Invalid email or password")
    return user


def change_password(session: Session, user: User, current_password: str, new_password: str) -> None:
    """Change the owner password after checking the current password."""
    if not verify_password(current_password, user.password_hash):
        raise AppException(401, "UNAUTHENTICATED", "Current password is incorrect")
    user.password_hash = hash_password(new_password)
    session.commit()

