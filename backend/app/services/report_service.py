from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models import GeneratedReport
from app.schemas.report import GeneratedReportCreate, GeneratedReportUpdate
from app.services.report_template_service import get_report_template_for_user


def get_generated_report_for_user(session: Session, user_id: UUID, report_id: UUID) -> GeneratedReport:
    """Return one saved report scoped to a user."""
    report = session.scalar(
        select(GeneratedReport).where(GeneratedReport.id == report_id, GeneratedReport.user_id == user_id)
    )
    if report is None:
        raise AppException(404, "GENERATED_REPORT_NOT_FOUND", "Saved report was not found")
    return report


def list_generated_reports(session: Session, user_id: UUID) -> list[GeneratedReport]:
    """Return saved reports scoped to one user."""
    return list(
        session.scalars(
            select(GeneratedReport)
            .where(GeneratedReport.user_id == user_id)
            .order_by(GeneratedReport.period_start.desc(), GeneratedReport.created_at.desc())
        )
    )


def create_generated_report(session: Session, user_id: UUID, payload: GeneratedReportCreate) -> GeneratedReport:
    """Create an owner saved report."""
    if payload.template_id is not None:
        get_report_template_for_user(session, user_id, payload.template_id)
    report = GeneratedReport(user_id=user_id, **payload.model_dump())
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def update_generated_report(
    session: Session,
    report: GeneratedReport,
    payload: GeneratedReportUpdate,
) -> GeneratedReport:
    """Update an owner saved report."""
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("template_id") is not None:
        get_report_template_for_user(session, report.user_id, updates["template_id"])
    for key, value in updates.items():
        setattr(report, key, value)
    session.commit()
    session.refresh(report)
    return report


def delete_generated_report(session: Session, report: GeneratedReport) -> None:
    """Delete an owner saved report."""
    session.delete(report)
    session.commit()
