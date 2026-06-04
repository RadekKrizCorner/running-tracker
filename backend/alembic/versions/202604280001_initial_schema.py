"""initial schema

Revision ID: 202604280001
Revises:
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202604280001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the initial application schema with explicit Alembic operations."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("units", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "provider_connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=128), nullable=True),
        sa.Column("scopes_granted", sa.JSON(), nullable=True),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_provider_connection_user_provider"),
    )

    op.create_table(
        "activities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_activity_id", sa.String(length=128), nullable=True),
        sa.Column("sport_type", sa.String(length=64), nullable=True),
        sa.Column("workout_type", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("start_time_local", sa.DateTime(timezone=False), nullable=True),
        sa.Column("timezone", sa.String(length=128), nullable=True),
        sa.Column("distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("moving_time_s", sa.Integer(), nullable=True),
        sa.Column("elapsed_time_s", sa.Integer(), nullable=True),
        sa.Column("elevation_gain_m", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("average_speed_mps", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("max_speed_mps", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("average_hr", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("max_hr", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("average_cadence", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("calories", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("perceived_effort", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("computed_load", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("load_source", sa.String(length=32), nullable=True),
        sa.Column("intensity_class", sa.String(length=32), nullable=True),
        sa.Column("map_polyline", sa.Text(), nullable=True),
        sa.Column("source_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_activity_id", name="uq_activity_provider_id"),
    )
    op.create_index("ix_activities_user_id", "activities", ["user_id"])
    op.create_index("ix_activities_start_time_utc", "activities", ["start_time_utc"])

    op.create_table(
        "activity_streams",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("stream_type", sa.String(length=64), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", "stream_type", name="uq_activity_stream_type"),
    )
    op.create_index("ix_activity_streams_activity_id", "activity_streams", ["activity_id"])

    op.create_table(
        "activity_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rpe", sa.Integer(), nullable=True),
        sa.Column("fatigue", sa.Integer(), nullable=True),
        sa.Column("soreness", sa.Integer(), nullable=True),
        sa.Column("pain_flag", sa.Boolean(), nullable=False),
        sa.Column("pain_location", sa.Text(), nullable=True),
        sa.Column("sleep_quality", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id"),
    )

    op.create_table(
        "gear",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("retirement_distance_m", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("retired_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gear_user_id", "gear", ["user_id"])

    op.create_table(
        "activity_gear",
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("gear_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["gear_id"], ["gear.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("activity_id", "gear_id"),
    )

    op.create_table(
        "training_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("goal_type", sa.String(length=64), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_training_plans_user_id", "training_plans", ["user_id"])

    op.create_table(
        "planned_workouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("workout_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_duration_s", sa.Integer(), nullable=True),
        sa.Column("target_distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("target_intensity", sa.String(length=32), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("completed_activity_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["completed_activity_id"], ["activities.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["training_plans.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_planned_workouts_scheduled_date", "planned_workouts", ["scheduled_date"])
    op.create_index("ix_planned_workouts_user_id", "planned_workouts", ["user_id"])

    op.create_table(
        "workout_steps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("planned_workout_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(length=64), nullable=False),
        sa.Column("duration_s", sa.Integer(), nullable=True),
        sa.Column("distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_min", sa.String(length=64), nullable=True),
        sa.Column("target_max", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["planned_workout_id"], ["planned_workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "workout_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("workout_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_duration_s", sa.Integer(), nullable=True),
        sa.Column("target_distance_m", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("target_intensity", sa.String(length=32), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_workout_template_user_name"),
    )
    op.create_index("ix_workout_templates_user_id", "workout_templates", ["user_id"])

    op.create_table(
        "weekly_metrics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("distance_m", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("moving_time_s", sa.Integer(), nullable=False),
        sa.Column("elevation_gain_m", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("run_count", sa.Integer(), nullable=False),
        sa.Column("load", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("acute_load", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("chronic_load", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("ramp_ratio", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("easy_time_s", sa.Integer(), nullable=False),
        sa.Column("moderate_time_s", sa.Integer(), nullable=False),
        sa.Column("hard_time_s", sa.Integer(), nullable=False),
        sa.Column("long_run_distance_m", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "week_start_date", name="uq_weekly_metric_user_week"),
    )
    op.create_index("ix_weekly_metrics_user_id", "weekly_metrics", ["user_id"])
    op.create_index("ix_weekly_metrics_week_start_date", "weekly_metrics", ["week_start_date"])


def downgrade() -> None:
    """Drop the initial application schema in reverse dependency order."""
    op.drop_index("ix_weekly_metrics_week_start_date", table_name="weekly_metrics")
    op.drop_index("ix_weekly_metrics_user_id", table_name="weekly_metrics")
    op.drop_table("weekly_metrics")
    op.drop_index("ix_workout_templates_user_id", table_name="workout_templates")
    op.drop_table("workout_templates")
    op.drop_table("workout_steps")
    op.drop_index("ix_planned_workouts_user_id", table_name="planned_workouts")
    op.drop_index("ix_planned_workouts_scheduled_date", table_name="planned_workouts")
    op.drop_table("planned_workouts")
    op.drop_index("ix_training_plans_user_id", table_name="training_plans")
    op.drop_table("training_plans")
    op.drop_table("activity_gear")
    op.drop_index("ix_gear_user_id", table_name="gear")
    op.drop_table("gear")
    op.drop_table("activity_notes")
    op.drop_index("ix_activity_streams_activity_id", table_name="activity_streams")
    op.drop_table("activity_streams")
    op.drop_index("ix_activities_start_time_utc", table_name="activities")
    op.drop_index("ix_activities_user_id", table_name="activities")
    op.drop_table("activities")
    op.drop_table("provider_connections")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
