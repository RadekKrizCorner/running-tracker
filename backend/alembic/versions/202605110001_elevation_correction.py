"""add elevation correction preferences

Revision ID: 202605110001
Revises: 202604300001
Create Date: 2026-05-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605110001"
down_revision = "202604300001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add elevation correction preference and activity source columns."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("user_preferences"):
        columns = {column["name"] for column in inspector.get_columns("user_preferences")}
        if "elevation_correction_enabled" not in columns:
            op.add_column(
                "user_preferences",
                sa.Column("elevation_correction_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "elevation_correction_mode" not in columns:
            op.add_column(
                "user_preferences",
                sa.Column("elevation_correction_mode", sa.String(length=32), nullable=False, server_default="only_when_zero"),
            )
        if "elevation_provider_url" not in columns:
            op.add_column("user_preferences", sa.Column("elevation_provider_url", sa.String(length=512), nullable=True))
    if inspector.has_table("activities"):
        columns = {column["name"] for column in inspector.get_columns("activities")}
        if "elevation_gain_source" not in columns:
            op.add_column("activities", sa.Column("elevation_gain_source", sa.String(length=32), nullable=True))


def downgrade() -> None:
    """Drop elevation correction preference and activity source columns."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("activities"):
        columns = {column["name"] for column in inspector.get_columns("activities")}
        if "elevation_gain_source" in columns:
            op.drop_column("activities", "elevation_gain_source")
    if inspector.has_table("user_preferences"):
        columns = {column["name"] for column in inspector.get_columns("user_preferences")}
        if "elevation_provider_url" in columns:
            op.drop_column("user_preferences", "elevation_provider_url")
        if "elevation_correction_mode" in columns:
            op.drop_column("user_preferences", "elevation_correction_mode")
        if "elevation_correction_enabled" in columns:
            op.drop_column("user_preferences", "elevation_correction_enabled")
