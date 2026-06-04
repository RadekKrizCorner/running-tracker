from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.exceptions import AppException
from app.core.security import hash_password, verify_password
from app.models import User


def setup_owner(session: Session, email: str, password: str) -> User:
    """Create or finish configuring the single owner account."""
    settings = get_settings()
    if email.lower() != settings.owner_email.lower():
        raise AppException(403, "FORBIDDEN", "Only the configured owner email can be used")
    user = session.scalar(select(User).where(User.is_demo.is_(False)).order_by(User.created_at).limit(1))
    if user is None:
        user = User(email=email.lower(), display_name="Runner", is_demo=False)
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
    user = session.scalar(select(User).where(User.email == email.lower(), User.is_demo.is_(False)))
    if user is None or not verify_password(password, user.password_hash):
        raise AppException(401, "UNAUTHENTICATED", "Invalid email or password")
    return user


def ensure_demo_account(session: Session, settings: Settings) -> User:
    """Create or update the configured demo account."""
    demo_email = settings.demo_account_email.strip().lower()
    demo_password = settings.demo_account_password
    if not settings.demo_account_enabled or not demo_email or not demo_password:
        raise AppException(404, "DEMO_ACCOUNT_DISABLED", "Demo account is not enabled")

    user = session.scalar(select(User).where(User.email == demo_email))
    if user is not None and not user.is_demo:
        raise AppException(409, "DEMO_ACCOUNT_CONFLICT", "Demo email belongs to a non-demo account")
    if user is None:
        user = User(email=demo_email, display_name=settings.demo_account_display_name, is_demo=True)
        session.add(user)
        session.flush()

    user.is_demo = True
    user.display_name = settings.demo_account_display_name
    user.password_hash = hash_password(demo_password)
    session.commit()
    session.refresh(user)
    return user


def authenticate_demo_account(session: Session, settings: Settings) -> User:
    """Return the configured demo account for a demo session."""
    return ensure_demo_account(session, settings)


def change_password(session: Session, user: User, current_password: str, new_password: str) -> None:
    """Change the owner password after checking the current password."""
    if not verify_password(current_password, user.password_hash):
        raise AppException(401, "UNAUTHENTICATED", "Current password is incorrect")
    user.password_hash = hash_password(new_password)
    session.commit()
