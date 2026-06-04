from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Column, DateTime, ForeignKey, JSON, Numeric, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


activity_gear = Table(
    "activity_gear",
    Base.metadata,
    Column("activity_id", Uuid(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True),
    Column("gear_id", Uuid(as_uuid=True), ForeignKey("gear.id", ondelete="CASCADE"), primary_key=True),
)


class Activity(Base):
    """Store normalized activities imported from providers or manual sources."""

    __tablename__ = "activities"
    __table_args__ = (UniqueConstraint("provider", "provider_activity_id", name="uq_activity_provider_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_activity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    workout_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    start_time_local: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    moving_time_s: Mapped[int | None] = mapped_column(nullable=True)
    elapsed_time_s: Mapped[int | None] = mapped_column(nullable=True)
    elevation_gain_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    average_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    max_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    average_hr: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    max_hr: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    average_cadence: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    calories: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    perceived_effort: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    computed_load: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    load_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    intensity_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    elevation_gain_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    map_polyline: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="activities")
    streams = relationship("ActivityStream", back_populates="activity", cascade="all, delete-orphan")
    note = relationship("ActivityNote", back_populates="activity", cascade="all, delete-orphan", uselist=False)
    gear = relationship("Gear", secondary=activity_gear, back_populates="activities")
