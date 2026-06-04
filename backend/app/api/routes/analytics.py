from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.core.time import week_start
from app.schemas.analytics import DashboardResponse, HeatmapResponse, TrendMetricWeek, WeeklyMetricRead, YearlyRunningSummary
from app.services.analytics_service import (
    aerobic_trend,
    dashboard_payload,
    prs,
    recent_weekly_metrics,
    run_heatmap,
    weekly_metrics_between,
    yearly_running_summary,
)
from app.services.trend_metrics_service import trend_metrics
from app.services.weekly_report_service import (
    build_weekly_report,
    render_weekly_report_png,
    render_weekly_report_svg,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    session: DbSession,
    user: CurrentUser,
    period: str = "week",
    week_start_date: date | None = None,
) -> DashboardResponse:
    """Return dashboard analytics."""
    return DashboardResponse(**dashboard_payload(session, user.id, period, week_start_date))


@router.get("/weekly", response_model=list[WeeklyMetricRead])
def weekly(
    session: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WeeklyMetricRead]:
    """Return weekly analytics."""
    return [
        WeeklyMetricRead.model_validate(metric, from_attributes=True)
        for metric in weekly_metrics_between(session, user.id, start_date, end_date)
    ]


@router.get("/weekly-report.svg")
def weekly_report_svg(session: DbSession, user: CurrentUser, week_start_date: date) -> Response:
    """Return a weekly report as SVG."""
    return _weekly_report_response(session, user, week_start_date, "svg")


@router.get("/weekly-report.png")
def weekly_report_png(session: DbSession, user: CurrentUser, week_start_date: date) -> Response:
    """Return a weekly report as PNG."""
    return _weekly_report_response(session, user, week_start_date, "png")


@router.get("/weekly-report")
def weekly_report(
    session: DbSession,
    user: CurrentUser,
    week_start_date: date,
    report_format: str = Query("svg", alias="format"),
) -> Response:
    """Return a weekly report in the requested format."""
    return _weekly_report_response(session, user, week_start_date, report_format)


@router.get("/recent-weeks", response_model=list[WeeklyMetricRead])
def recent_weeks(session: DbSession, user: CurrentUser, weeks: int = 4) -> list[WeeklyMetricRead]:
    """Return dense recent weekly analytics."""
    return [WeeklyMetricRead.model_validate(metric) for metric in recent_weekly_metrics(session, user.id, weeks)]


@router.get("/yearly-summary", response_model=YearlyRunningSummary)
def yearly_summary(
    session: DbSession,
    user: CurrentUser,
    year: int = Query(..., ge=1900, le=2200),
) -> YearlyRunningSummary:
    """Return owner running totals for a full calendar year."""
    return YearlyRunningSummary(**yearly_running_summary(session, user.id, year))


@router.get("/trend-metrics", response_model=list[TrendMetricWeek])
def detailed_trends(session: DbSession, user: CurrentUser, weeks: int = 13) -> list[TrendMetricWeek]:
    """Return dense detailed weekly trend metrics."""
    return [TrendMetricWeek.model_validate(metric) for metric in trend_metrics(session, user.id, weeks)]


@router.get("/load")
def load(
    session: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict]:
    """Return load analytics."""
    return [metric.model_dump() for metric in weekly(session, user, start_date, end_date)]


@router.get("/intensity")
def intensity(
    session: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict]:
    """Return intensity analytics."""
    return [
        {
            "week_start_date": item.week_start_date,
            "easy_time_s": item.easy_time_s,
            "moderate_time_s": item.moderate_time_s,
            "hard_time_s": item.hard_time_s,
            "unknown_time_s": item.unknown_time_s,
        }
        for item in weekly(session, user, start_date, end_date)
    ]


@router.get("/aerobic-trend")
def aerobic(session: DbSession, user: CurrentUser) -> list[dict]:
    """Return easy-run efficiency trend data."""
    return aerobic_trend(session, user.id)


@router.get("/prs")
def personal_records(session: DbSession, user: CurrentUser) -> dict:
    """Return simple personal records."""
    return prs(session, user.id)


@router.get("/heatmap", response_model=HeatmapResponse)
def heatmap(
    session: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
    precision: int = 3,
    limit: int = 2000,
) -> HeatmapResponse:
    """Return aggregated running route heatmap data."""
    return HeatmapResponse(**run_heatmap(session, user.id, start_date, end_date, precision, limit))


def _weekly_report_response(
    session: DbSession,
    user: CurrentUser,
    week_start_date: date,
    report_format: str,
) -> Response:
    """Build a weekly report file response."""
    normalized_format = report_format.strip().lower()
    if normalized_format not in {"svg", "png"}:
        raise AppException(400, "UNSUPPORTED_REPORT_FORMAT", "Report format must be svg or png")
    normalized_week_start = week_start(week_start_date)
    report = build_weekly_report(session, user, normalized_week_start)
    filename = f"weekly-report-{normalized_week_start.isoformat()}.{normalized_format}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if normalized_format == "svg":
        return Response(
            content=render_weekly_report_svg(report),
            media_type="image/svg+xml",
            headers=headers,
        )
    if normalized_format == "png":
        return Response(
            content=render_weekly_report_png(report),
            media_type="image/png",
            headers=headers,
        )
    raise AppException(400, "UNSUPPORTED_REPORT_FORMAT", "Report format must be svg or png")
