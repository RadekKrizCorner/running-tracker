from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models import GeneratedReport, ReportTemplate
from app.schemas.report import ReportTemplateCreate, ReportTemplateUpdate


def default_report_template_payload() -> dict[str, Any]:
    """Return the default Instagram story report template payload."""
    return {
        "name": "Maratonská příprava",
        "description": "Výchozí 9:16 Instagram report podle maratonské šablony.",
        "format": "instagram_story",
        "theme": {
            "background": "#0B1020",
            "surface": "#151C2F",
            "primary": "#B7FF2A",
            "secondary": "#FF8A00",
            "text": "#FFFFFF",
            "muted": "#AAB2C8",
        },
        "sections": [
            {"id": "header", "label": "Program, nadpis a týden"},
            {"id": "hero", "label": "Hlavní vzdálenost a splnění plánu"},
            {"id": "stats", "label": "Karty metrik"},
            {"id": "volume", "label": "Plánovaný a skutečný objem"},
            {"id": "story", "label": "Shrnutí, úspěchy a fokus"},
            {"id": "footer", "label": "Patička"},
        ],
        "field_defaults": {
            "program": "MARATONSKÁ PŘÍPRAVA",
            "title": "Týdenní běžecký report",
            "week": "Týden 1",
            "main_distance": "25,4",
            "main_unit": "km",
            "main_label": "naběháno tento týden",
            "completion_percent": 55,
            "stats": {
                "runs": "3",
                "time": "3 h 06 min",
                "plan_vs_actual": "46,0 / 25,4 km",
                "longest_run": "9,0 km",
                "avg_pace": "7:20 min/km",
                "training_adherence": "3/5",
            },
            "volume": {"planned": 46.0, "actual": 25.4, "difference": -20.6},
            "summary_lines": [
                "Solidní úvodní týden s třemi splněnými běhy.",
                "Objem byl nižší než plán, ale běhy proběhly pravidelně.",
            ],
            "went_well": [
                "tři běhy splněné v klidné easy intenzitě",
                "páteční běh delší než plán",
                "stabilní tep a dobrá kontrola tempa",
            ],
            "focus_next": [
                "doplnit chybějící víkendové běhy",
                "držet pravidelnost po celý týden",
                "postupně navýšit objem směrem k plánu",
            ],
            "footer": ["Běžecký plán", "konzistence", "vytrvalost", "maraton 2026"],
        },
        "is_default": True,
    }


def ensure_default_report_template(session: Session, user_id: UUID) -> ReportTemplate:
    """Ensure the owner has one default report template."""
    existing = session.scalar(
        select(ReportTemplate)
        .where(ReportTemplate.user_id == user_id, ReportTemplate.is_default.is_(True))
        .order_by(ReportTemplate.created_at)
        .limit(1)
    )
    if existing is not None:
        return existing
    template = ReportTemplate(user_id=user_id, **default_report_template_payload())
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def get_report_template_for_user(session: Session, user_id: UUID, template_id: UUID) -> ReportTemplate:
    """Return one report template scoped to a user."""
    template = session.scalar(
        select(ReportTemplate).where(ReportTemplate.id == template_id, ReportTemplate.user_id == user_id)
    )
    if template is None:
        raise AppException(404, "REPORT_TEMPLATE_NOT_FOUND", "Report template was not found")
    return template


def list_report_templates(session: Session, user_id: UUID, create_default: bool = True) -> list[ReportTemplate]:
    """Return report templates scoped to one user."""
    if create_default:
        ensure_default_report_template(session, user_id)
    return list(
        session.scalars(
            select(ReportTemplate)
            .where(ReportTemplate.user_id == user_id)
            .order_by(ReportTemplate.is_default.desc(), ReportTemplate.name)
        )
    )


def create_report_template(session: Session, user_id: UUID, payload: ReportTemplateCreate) -> ReportTemplate:
    """Create an owner report template."""
    _raise_if_template_name_exists(session, user_id, payload.name)
    if payload.is_default:
        _clear_default_template(session, user_id)
    template = ReportTemplate(user_id=user_id, **payload.model_dump())
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def update_report_template(
    session: Session,
    template: ReportTemplate,
    payload: ReportTemplateUpdate,
) -> ReportTemplate:
    """Update an owner report template."""
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] != template.name:
        _raise_if_template_name_exists(session, template.user_id, updates["name"], exclude_template_id=template.id)
    if updates.get("is_default") is True:
        _clear_default_template(session, template.user_id)
    for key, value in updates.items():
        setattr(template, key, value)
    session.commit()
    session.refresh(template)
    return template


def delete_report_template(session: Session, template: ReportTemplate) -> None:
    """Delete an owner report template."""
    session.execute(
        update(GeneratedReport)
        .where(GeneratedReport.user_id == template.user_id, GeneratedReport.template_id == template.id)
        .values(template_id=None)
    )
    session.delete(template)
    session.commit()


def _raise_if_template_name_exists(
    session: Session,
    user_id: UUID,
    name: str,
    exclude_template_id: UUID | None = None,
) -> None:
    """Raise when a report template name already exists for a user."""
    query = select(ReportTemplate).where(ReportTemplate.user_id == user_id, ReportTemplate.name == name)
    if exclude_template_id is not None:
        query = query.where(ReportTemplate.id != exclude_template_id)
    if session.scalar(query) is not None:
        raise AppException(409, "REPORT_TEMPLATE_EXISTS", "A report template with this name already exists")


def _clear_default_template(session: Session, user_id: UUID) -> None:
    """Clear the current default report template for a user."""
    session.execute(
        update(ReportTemplate).where(ReportTemplate.user_id == user_id, ReportTemplate.is_default.is_(True)).values(
            is_default=False
        )
    )
