"""Add route start preferences.

Revision ID: 202606060002
Revises: 202606060001
Create Date: 2026-06-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202606060002"
down_revision = "202606060001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add default route start preference columns."""
    op.add_column("user_preferences", sa.Column("route_start_lat", sa.Float(), nullable=True))
    op.add_column("user_preferences", sa.Column("route_start_lng", sa.Float(), nullable=True))
    op.add_column("user_preferences", sa.Column("route_start_label", sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Drop default route start preference columns."""
    op.drop_column("user_preferences", "route_start_label")
    op.drop_column("user_preferences", "route_start_lng")
    op.drop_column("user_preferences", "route_start_lat")
