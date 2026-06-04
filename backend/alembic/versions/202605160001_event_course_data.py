"""add event course data

Revision ID: 202605160001
Revises: 202605110001
Create Date: 2026-05-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202605160001"
down_revision = "202605110001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add event course map URL and GPX columns."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    if "course_map_url" not in columns:
        op.add_column("events", sa.Column("course_map_url", sa.Text(), nullable=True))
    if "course_gpx" not in columns:
        op.add_column("events", sa.Column("course_gpx", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop event course map URL and GPX columns."""
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    if "course_gpx" in columns:
        op.drop_column("events", "course_gpx")
    if "course_map_url" in columns:
        op.drop_column("events", "course_map_url")
