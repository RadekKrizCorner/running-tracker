"""add events

Revision ID: 202604290002
Revises: 202604290001
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202604290002"
down_revision = "202604290001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create Events table."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("events"):
        return
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("elevation_gain_m", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("surface", sa.String(length=64), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("target_time_s", sa.Integer(), nullable=True),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("goal_notes", sa.Text(), nullable=True),
        sa.Column("course_notes", sa.Text(), nullable=True),
        sa.Column("fueling_notes", sa.Text(), nullable=True),
        sa.Column("gear_notes", sa.Text(), nullable=True),
        sa.Column("travel_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_user_id", "events", ["user_id"])
    op.create_index("ix_events_event_date", "events", ["event_date"])


def downgrade() -> None:
    """Drop Events table."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        return
    op.drop_index("ix_events_event_date", table_name="events")
    op.drop_index("ix_events_user_id", table_name="events")
    op.drop_table("events")
