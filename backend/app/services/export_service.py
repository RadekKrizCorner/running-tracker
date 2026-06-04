from __future__ import annotations

import csv
import json
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO, StringIO
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Activity, ActivityNote, Gear, PlannedWorkout, ProviderConnection, User, WeeklyMetric


def export_user_data(session: Session, user: User) -> bytes:
    """Build a ZIP export for all local owner data."""
    buffer = BytesIO()
    with ZipFile(buffer, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("profile.json", _json({"email": user.email, "timezone": user.timezone, "units": user.units}))
        archive.writestr("provider_connections.json", _json(_connections(session, user.id)))
        archive.writestr("activities.json", _json(_rows(session, Activity, user.id)))
        archive.writestr("activity_notes.json", _json(_rows(session, ActivityNote, user.id)))
        archive.writestr("gear.json", _json(_rows(session, Gear, user.id)))
        archive.writestr("planned_workouts.json", _json(_rows(session, PlannedWorkout, user.id)))
        archive.writestr("weekly_metrics.csv", _csv(_rows(session, WeeklyMetric, user.id)))
        archive.writestr("activities.csv", _csv(_rows(session, Activity, user.id)))
    return buffer.getvalue()


def _rows(session: Session, model, user_id: UUID) -> list[dict]:
    """Return ORM rows as dictionaries."""
    records = list(session.scalars(select(model).where(model.user_id == user_id)))
    return [{key: value for key, value in record.__dict__.items() if not key.startswith("_")} for record in records]


def _connections(session: Session, user_id: UUID) -> list[dict]:
    """Return provider connections without tokens."""
    connections = list(session.scalars(select(ProviderConnection).where(ProviderConnection.user_id == user_id)))
    return [
        {
            "id": connection.id,
            "provider": connection.provider,
            "provider_user_id": connection.provider_user_id,
            "scopes_granted": connection.scopes_granted,
            "status": connection.status,
            "last_sync_at": connection.last_sync_at,
            "last_error": connection.last_error,
        }
        for connection in connections
    ]


def _json(value: object) -> str:
    """Serialize export data to JSON."""
    return json.dumps(value, default=_serialize, indent=2)


def _csv(rows: list[dict]) -> str:
    """Serialize export rows to CSV."""
    if not rows:
        return ""
    output = StringIO()
    fieldnames = sorted(rows[0].keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: _serialize(value) for key, value in row.items()})
    return output.getvalue()


def _serialize(value: object) -> object:
    """Serialize common database values."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value

