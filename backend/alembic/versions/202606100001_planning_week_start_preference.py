"""Add planning week start preference.

Revision ID: 202606100001
Revises: 202606060002
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202606100001"
down_revision = "202606060002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the saved planning range start column."""
    op.add_column("user_preferences", sa.Column("planning_week_start_date", sa.Date(), nullable=True))


def downgrade() -> None:
    """Drop the saved planning range start column."""
    op.drop_column("user_preferences", "planning_week_start_date")
