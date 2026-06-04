from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class UserPreference(Base):
    """Store owner UI and planning preferences."""

    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_preferences_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(16), default="cs-CZ", nullable=False)
    dashboard_mode: Mapped[str] = mapped_column(String(32), default="advanced", nullable=False)
    favorite_template_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    recent_template_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    pace_zones: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    elevation_correction_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    elevation_correction_mode: Mapped[str] = mapped_column(String(32), default="only_when_zero", nullable=False)
    elevation_provider_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    avatar_icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    avatar_image_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="preferences")
