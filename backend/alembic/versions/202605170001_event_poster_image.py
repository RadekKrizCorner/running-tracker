"""add event poster image

Revision ID: 202605170001
Revises: 202605160001
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605170001"
down_revision = "202605160001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add optional custom poster image data to events."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    if "poster_image_data" not in columns:
        op.add_column("events", sa.Column("poster_image_data", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop optional custom poster image data from events."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    if "poster_image_data" in columns:
        op.drop_column("events", "poster_image_data")
