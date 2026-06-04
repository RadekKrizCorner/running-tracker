from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class WeeklyMetric(Base):
    """Store recomputed weekly running aggregates."""

    __tablename__ = "weekly_metrics"
    __table_args__ = (UniqueConstraint("user_id", "week_start_date", name="uq_weekly_metric_user_week"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    distance_m: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    moving_time_s: Mapped[int] = mapped_column(default=0, nullable=False)
    elevation_gain_m: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    run_count: Mapped[int] = mapped_column(default=0, nullable=False)
    load: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    acute_load: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    chronic_load: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    ramp_ratio: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    easy_time_s: Mapped[int] = mapped_column(default=0, nullable=False)
    moderate_time_s: Mapped[int] = mapped_column(default=0, nullable=False)
    hard_time_s: Mapped[int] = mapped_column(default=0, nullable=False)
    long_run_distance_m: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="weekly_metrics")

    @property
    def unknown_time_s(self) -> int:
        """Return moving time without an easy, moderate, or hard label."""
        known_time = self.easy_time_s + self.moderate_time_s + self.hard_time_s
        return max(self.moving_time_s - known_time, 0)
