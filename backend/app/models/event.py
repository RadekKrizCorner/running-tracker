from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class Event(Base):
    """Store a goal race or running event."""

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    elevation_gain_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    surface: Mapped[str | None] = mapped_column(String(64), nullable=True)
    priority: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="planned", nullable=False)
    target_time_s: Mapped[int | None] = mapped_column(nullable=True)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    course_map_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    course_gpx: Mapped[str | None] = mapped_column(Text, nullable=True)
    poster_image_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    course_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    fueling_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    gear_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    travel_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="events")
