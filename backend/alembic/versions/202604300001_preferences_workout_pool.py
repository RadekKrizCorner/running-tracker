"""add user preferences and workout pool

Revision ID: 202604300001
Revises: 202604290002
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202604300001"
down_revision = "202604290002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create owner preferences and unscheduled workout pool tables."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("user_preferences"):
        op.create_table(
            "user_preferences",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("locale", sa.String(length=16), nullable=False),
            sa.Column("dashboard_mode", sa.String(length=32), nullable=False),
            sa.Column("favorite_template_ids", sa.JSON(), nullable=False),
            sa.Column("recent_template_ids", sa.JSON(), nullable=False),
            sa.Column("pace_zones", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_user_preferences_user_id"),
        )
        op.create_index("ix_user_preferences_user_id", "user_preferences", ["user_id"])
    if not inspector.has_table("workout_pool_items"):
        op.create_table(
            "workout_pool_items",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("source_template_id", sa.Uuid(), nullable=True),
            sa.Column("workout_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("target_duration_s", sa.Integer(), nullable=True),
            sa.Column("target_distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
            sa.Column("target_intensity", sa.String(length=32), nullable=True),
            sa.Column("instructions", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["source_template_id"], ["workout_templates.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_workout_pool_items_user_id", "workout_pool_items", ["user_id"])


def downgrade() -> None:
    """Drop workout pool and owner preferences tables."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("workout_pool_items"):
        op.drop_index("ix_workout_pool_items_user_id", table_name="workout_pool_items")
        op.drop_table("workout_pool_items")
    if inspector.has_table("user_preferences"):
        op.drop_index("ix_user_preferences_user_id", table_name="user_preferences")
        op.drop_table("user_preferences")
