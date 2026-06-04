"""add hr zones and calendar events

Revision ID: 202604290001
Revises: 202604280001
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202604290001"
down_revision = "202604280001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create HR zone history and calendar event tables."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("calendar_events"):
        op.create_table(
            "calendar_events",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("event_date", sa.Date(), nullable=False),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
        op.create_index("ix_calendar_events_event_date", "calendar_events", ["event_date"])
    if not inspector.has_table("heart_rate_zone_sets"):
        op.create_table(
            "heart_rate_zone_sets",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("effective_from", sa.Date(), nullable=False),
            sa.Column("zones", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "effective_from", name="uq_hr_zone_set_user_effective_from"),
        )
        op.create_index("ix_heart_rate_zone_sets_user_id", "heart_rate_zone_sets", ["user_id"])
        op.create_index("ix_heart_rate_zone_sets_effective_from", "heart_rate_zone_sets", ["effective_from"])


def downgrade() -> None:
    """Drop HR zone history and calendar event tables."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("heart_rate_zone_sets"):
        op.drop_index("ix_heart_rate_zone_sets_effective_from", table_name="heart_rate_zone_sets")
        op.drop_index("ix_heart_rate_zone_sets_user_id", table_name="heart_rate_zone_sets")
        op.drop_table("heart_rate_zone_sets")
    if inspector.has_table("calendar_events"):
        op.drop_index("ix_calendar_events_event_date", table_name="calendar_events")
        op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
        op.drop_table("calendar_events")
