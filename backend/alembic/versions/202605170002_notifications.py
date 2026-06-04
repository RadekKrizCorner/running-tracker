"""add notifications

Revision ID: 202605170002
Revises: 202605170001
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605170002"
down_revision = "202605170001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create owner notifications table."""
    inspector = inspect(op.get_bind())
    if inspector.has_table("notifications"):
        return
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("action_url", sa.Text(), nullable=True),
        sa.Column("action_label", sa.String(length=80), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_id", sa.String(length=128), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "type", "source_type", "source_id", name="uq_notifications_source"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    """Drop owner notifications table."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("notifications"):
        return
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
