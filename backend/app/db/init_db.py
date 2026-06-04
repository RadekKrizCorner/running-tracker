from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_engine
from app.models import User


def create_database() -> None:
    """Create database tables for local development and tests."""
    Base.metadata.create_all(bind=get_engine())


def ensure_owner(session: Session) -> User:
    """Ensure the single owner account exists."""
    settings = get_settings()
    user = session.scalar(select(User).order_by(User.created_at).limit(1))
    if user is not None:
        return user
    user = User(email=settings.owner_email, display_name="Runner")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

