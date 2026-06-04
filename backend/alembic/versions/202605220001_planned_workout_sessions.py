"""add planned workout session fields

Revision ID: 202605220001
Revises: 202605210001
Create Date: 2026-05-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605220001"
down_revision = "202605210001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add session label and ordering to planned workouts."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("planned_workouts"):
        return
    columns = {column["name"] for column in inspector.get_columns("planned_workouts")}
    if "session_label" not in columns:
        op.add_column("planned_workouts", sa.Column("session_label", sa.String(length=64), nullable=True))
    if "sort_order" not in columns:
        op.add_column("planned_workouts", sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False))
        if op.get_bind().dialect.name != "sqlite":
            op.alter_column("planned_workouts", "sort_order", server_default=None)


def downgrade() -> None:
    """Remove session label and ordering from planned workouts."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("planned_workouts"):
        return
    columns = {column["name"] for column in inspector.get_columns("planned_workouts")}
    if "sort_order" in columns:
        op.drop_column("planned_workouts", "sort_order")
    if "session_label" in columns:
        op.drop_column("planned_workouts", "session_label")
