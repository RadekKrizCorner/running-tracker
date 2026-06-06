from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, DbSession, WritableUser
from app.core.time import week_start
from app.schemas.report import (
    GeneratedReportCreate,
    GeneratedReportRead,
    GeneratedReportUpdate,
    ReportPrefillRequest,
    ReportPrefillResponse,
    ReportRenderRequest,
    ReportTemplateCreate,
    ReportTemplateRead,
    ReportTemplateUpdate,
)
from app.services.report_prefill_service import build_weekly_report_prefill
from app.services.report_render_service import render_report_png, render_report_svg
from app.services.report_service import (
    create_generated_report,
    delete_generated_report,
    get_generated_report_for_user,
    list_generated_reports,
    update_generated_report,
)
from app.services.report_template_service import (
    create_report_template,
    delete_report_template,
    ensure_default_report_template,
    get_report_template_for_user,
    list_report_templates,
    update_report_template,
)

router = APIRouter(tags=["reports"])


@router.get("/report-templates", response_model=list[ReportTemplateRead])
def get_report_templates(session: DbSession, user: CurrentUser) -> list[ReportTemplateRead]:
    """Return owner report templates."""
    return [
        ReportTemplateRead.model_validate(template)
        for template in list_report_templates(session, user.id, create_default=not user.is_demo)
    ]


@router.post("/report-templates", response_model=ReportTemplateRead)
def post_report_template(
    payload: ReportTemplateCreate,
    session: DbSession,
    user: WritableUser,
) -> ReportTemplateRead:
    """Create an owner report template."""
    return ReportTemplateRead.model_validate(create_report_template(session, user.id, payload))


@router.get("/report-templates/{template_id}", response_model=ReportTemplateRead)
def get_report_template(template_id: UUID, session: DbSession, user: CurrentUser) -> ReportTemplateRead:
    """Return one owner report template."""
    return ReportTemplateRead.model_validate(get_report_template_for_user(session, user.id, template_id))


@router.patch("/report-templates/{template_id}", response_model=ReportTemplateRead)
def patch_report_template(
    template_id: UUID,
    payload: ReportTemplateUpdate,
    session: DbSession,
    user: WritableUser,
) -> ReportTemplateRead:
    """Update one owner report template."""
    template = get_report_template_for_user(session, user.id, template_id)
    return ReportTemplateRead.model_validate(update_report_template(session, template, payload))


@router.delete("/report-templates/{template_id}", status_code=204)
def remove_report_template(template_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete one owner report template."""
    template = get_report_template_for_user(session, user.id, template_id)
    delete_report_template(session, template)
    return Response(status_code=204)


@router.post("/reports/prefill", response_model=ReportPrefillResponse)
def post_report_prefill(
    payload: ReportPrefillRequest,
    session: DbSession,
    user: CurrentUser,
) -> ReportPrefillResponse:
    """Return editable report values prefilled from owner week data."""
    normalized_week_start = week_start(payload.week_start_date)
    template_id = payload.template_id
    if template_id is not None:
        get_report_template_for_user(session, user.id, template_id)
    elif not user.is_demo:
        template_id = ensure_default_report_template(session, user.id).id
    return ReportPrefillResponse(
        template_id=template_id,
        period_start=normalized_week_start,
        period_end=normalized_week_start + timedelta(days=6),
        values=build_weekly_report_prefill(session, user, normalized_week_start),
    )


@router.post("/reports/render.svg")
def post_report_render_svg(payload: ReportRenderRequest, user: CurrentUser) -> Response:
    """Return report values rendered as SVG."""
    _ = user
    return Response(
        content=render_report_svg(payload.values, payload.template),
        media_type="image/svg+xml",
        headers={"Content-Disposition": 'attachment; filename="instagram-report.svg"'},
    )


@router.post("/reports/render.png")
def post_report_render_png(payload: ReportRenderRequest, user: CurrentUser) -> Response:
    """Return report values rendered as PNG."""
    _ = user
    return Response(
        content=render_report_png(payload.values, payload.template),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="instagram-report.png"'},
    )


@router.get("/reports", response_model=list[GeneratedReportRead])
def get_reports(session: DbSession, user: CurrentUser) -> list[GeneratedReportRead]:
    """Return owner saved reports."""
    return [GeneratedReportRead.model_validate(report) for report in list_generated_reports(session, user.id)]


@router.post("/reports", response_model=GeneratedReportRead)
def post_report(
    payload: GeneratedReportCreate,
    session: DbSession,
    user: WritableUser,
) -> GeneratedReportRead:
    """Create an owner saved report."""
    return GeneratedReportRead.model_validate(create_generated_report(session, user.id, payload))


@router.get("/reports/{report_id}", response_model=GeneratedReportRead)
def get_report(report_id: UUID, session: DbSession, user: CurrentUser) -> GeneratedReportRead:
    """Return one owner saved report."""
    return GeneratedReportRead.model_validate(get_generated_report_for_user(session, user.id, report_id))


@router.patch("/reports/{report_id}", response_model=GeneratedReportRead)
def patch_report(
    report_id: UUID,
    payload: GeneratedReportUpdate,
    session: DbSession,
    user: WritableUser,
) -> GeneratedReportRead:
    """Update one owner saved report."""
    report = get_generated_report_for_user(session, user.id, report_id)
    return GeneratedReportRead.model_validate(update_generated_report(session, report, payload))


@router.delete("/reports/{report_id}", status_code=204)
def remove_report(report_id: UUID, session: DbSession, user: WritableUser) -> Response:
    """Delete one owner saved report."""
    report = get_generated_report_for_user(session, user.id, report_id)
    delete_generated_report(session, report)
    return Response(status_code=204)
