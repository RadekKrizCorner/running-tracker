from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class ActivityStream(Base):
    """Store sampled stream data for an activity."""

    __tablename__ = "activity_streams"
    __table_args__ = (UniqueConstraint("activity_id", "stream_type", name="uq_activity_stream_type"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stream_type: Mapped[str] = mapped_column(String(64), nullable=False)
    data: Mapped[list | dict] = mapped_column(JSON, nullable=False)
    sample_count: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    activity = relationship("Activity", back_populates="streams")

