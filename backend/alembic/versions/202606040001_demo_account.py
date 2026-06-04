"""demo account flag

Revision ID: 202606040001
Revises: 202605220001
Create Date: 2026-06-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202606040001"
down_revision = "202605220001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add an explicit demo-account marker to users."""
    op.add_column(
        "users",
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    """Remove the demo-account marker from users."""
    op.drop_column("users", "is_demo")
