from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class ActivityNote(Base):
    """Store owner notes and subjective wellness values for an activity."""

    __tablename__ = "activity_notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    rpe: Mapped[int | None] = mapped_column(nullable=True)
    fatigue: Mapped[int | None] = mapped_column(nullable=True)
    soreness: Mapped[int | None] = mapped_column(nullable=True)
    pain_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pain_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    sleep_quality: Mapped[int | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    activity = relationship("Activity", back_populates="note")

