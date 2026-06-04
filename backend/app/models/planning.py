from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.time import utc_now
from app.db.base import Base


class TrainingPlan(Base):
    """Store a generated or manual training plan."""

    __tablename__ = "training_plans"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    goal_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="plans")
    workouts = relationship("PlannedWorkout", back_populates="plan", cascade="all, delete-orphan")


class PlannedWorkout(Base):
    """Store a planned workout on the calendar."""

    __tablename__ = "planned_workouts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("training_plans.id"), nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    session_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)
    workout_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_duration_s: Mapped[int | None] = mapped_column(nullable=True)
    target_distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    target_intensity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_activity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("activities.id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(32), default="planned", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="planned_workouts")
    plan = relationship("TrainingPlan", back_populates="workouts")
    steps = relationship("WorkoutStep", back_populates="planned_workout", cascade="all, delete-orphan")


class WorkoutStep(Base):
    """Store a step inside a planned structured workout."""

    __tablename__ = "workout_steps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    planned_workout_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("planned_workouts.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_order: Mapped[int] = mapped_column(nullable=False)
    step_type: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_s: Mapped[int | None] = mapped_column(nullable=True)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    target_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_min: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_max: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    planned_workout = relationship("PlannedWorkout", back_populates="steps")


class WorkoutTemplate(Base):
    """Store a reusable planned workout template."""

    __tablename__ = "workout_templates"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_workout_template_user_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    workout_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_duration_s: Mapped[int | None] = mapped_column(nullable=True)
    target_distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    target_intensity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="workout_templates")


class WorkoutPoolItem(Base):
    """Store an unscheduled workout draft for later scheduling."""

    __tablename__ = "workout_pool_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    source_template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workout_templates.id"),
        nullable=True,
    )
    workout_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_duration_s: Mapped[int | None] = mapped_column(nullable=True)
    target_distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    target_intensity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="workout_pool_items")
    source_template = relationship("WorkoutTemplate")
