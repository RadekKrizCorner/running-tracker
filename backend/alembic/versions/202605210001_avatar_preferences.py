"""add avatar preferences

Revision ID: 202605210001
Revises: 202605170002
Create Date: 2026-05-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605210001"
down_revision = "202605170002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add profile avatar fields to owner preferences."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("user_preferences"):
        return
    columns = {column["name"] for column in inspector.get_columns("user_preferences")}
    if "avatar_icon" not in columns:
        op.add_column("user_preferences", sa.Column("avatar_icon", sa.String(length=64), nullable=True))
    if "avatar_image_data_url" not in columns:
        op.add_column("user_preferences", sa.Column("avatar_image_data_url", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove profile avatar fields from owner preferences."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("user_preferences"):
        return
    columns = {column["name"] for column in inspector.get_columns("user_preferences")}
    if "avatar_image_data_url" in columns:
        op.drop_column("user_preferences", "avatar_image_data_url")
    if "avatar_icon" in columns:
        op.drop_column("user_preferences", "avatar_icon")
