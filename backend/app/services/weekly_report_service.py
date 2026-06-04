from __future__ import annotations

# ruff: noqa: E501

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from html import escape
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import start_of_day, week_start
from app.models import Activity, PlannedWorkout, TrainingPlan, User
from app.services.analytics_service import RUNNING_TYPES
from app.services.planning_service import deduplicate_planned_workouts_by_session

REPORT_WIDTH = 1080
REPORT_HEIGHT = 1920


@dataclass(frozen=True)
class WeeklyReport:
    """Hold display-ready values for one weekly visual report."""

    plan_title: str
    week_label: str
    total_distance_label: str
    completed_runs_label: str
    total_time_label: str
    plan_actual_label: str
    longest_run_label: str
    average_pace_label: str
    session_adherence_label: str
    completion_label: str
    volume_delta_label: str
    planned_distance_label: str
    completed_distance_label: str
    summary_text: str
    win_lines: tuple[str, str]
    planned_distance_m: float
    completed_distance_m: float
    completion_ratio: float


def build_weekly_report(session: Session, user: User, selected_week_start: date) -> WeeklyReport:
    """Build display values for one owner weekly report."""
    report_week_start = week_start(selected_week_start)
    report_week_end = report_week_start + timedelta(days=6)
    plan = _covering_training_plan(session, user.id, report_week_start)
    workouts = _planned_workouts(session, user.id, report_week_start, report_week_end)
    activities = _running_activities(
        session,
        user.id,
        user.timezone,
        report_week_start,
        report_week_end,
    )
    planned_distance_m = _sum_decimal(workout.target_distance_m for workout in workouts)
    completed_distance_m = _sum_decimal(activity.distance_m for activity in activities)
    completed_time_s = sum(activity.moving_time_s or 0 for activity in activities)
    planned_sessions = sum(1 for workout in workouts if workout.workout_type != "rest")
    completed_sessions = len(activities)
    longest_run_m = max((float(activity.distance_m or 0) for activity in activities), default=0)
    completion_ratio = float(completed_distance_m / planned_distance_m) if planned_distance_m > 0 else 0
    return WeeklyReport(
        plan_title=_report_plan_title(plan),
        week_label=_report_week_label(plan, report_week_start),
        total_distance_label=_format_km(completed_distance_m),
        completed_runs_label=str(completed_sessions),
        total_time_label=_format_duration(completed_time_s),
        plan_actual_label=f"{_format_km_value(planned_distance_m)}/{_format_km_value(completed_distance_m)}",
        longest_run_label=_format_km(Decimal(str(longest_run_m))),
        average_pace_label=_format_pace(completed_time_s, completed_distance_m),
        session_adherence_label=f"{completed_sessions}/{planned_sessions}",
        completion_label=f"{round(completion_ratio * 100)}%",
        volume_delta_label=_format_signed_km(completed_distance_m - planned_distance_m),
        planned_distance_label=_format_km(planned_distance_m),
        completed_distance_label=_format_km(completed_distance_m),
        summary_text=_summary_text(completed_sessions, completion_ratio),
        win_lines=_win_lines(completed_sessions, longest_run_m),
        planned_distance_m=float(planned_distance_m),
        completed_distance_m=float(completed_distance_m),
        completion_ratio=completion_ratio,
    )


def render_weekly_report_svg(report: WeeklyReport) -> str:
    """Render a weekly report as an SVG document."""
    progress_dash = round(540 * max(0, min(report.completion_ratio, 1)))
    planned_width, completed_width = _volume_bar_widths(report.planned_distance_m, report.completed_distance_m)
    route_icon = _route_map_pin_icon_svg()
    summary_lines = _wrap_svg_text(report.summary_text, 30, 2)
    summary_markup = "".join(
        f'<text x="122" y="{668 + (index * 38)}" class="font summary">{_svg_text(line)}</text>'
        for index, line in enumerate(summary_lines)
    )
    return f"""<svg width="{REPORT_WIDTH}" height="{REPORT_HEIGHT}" viewBox="0 0 {REPORT_WIDTH} {REPORT_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0B1020"/><stop offset="1" stop-color="#111A32"/>
    </linearGradient>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
    <style>
      .font {{ font-family: Inter, SF Pro Display, Helvetica, Arial, sans-serif; }}
      .label {{ fill: #AAB2C8; font-size: 28px; font-weight: 700; letter-spacing: 1.4px; }}
      .small {{ fill: #AAB2C8; font-size: 27px; font-weight: 500; }}
      .tiny {{ fill: #AAB2C8; font-size: 22px; font-weight: 500; }}
      .title {{ fill: #FFFFFF; font-size: 60px; font-weight: 850; letter-spacing: 0; }}
      .subtitle {{ fill: #B7FF2A; font-size: 40px; font-weight: 850; }}
      .metric {{ fill: #FFFFFF; font-size: 56px; font-weight: 850; letter-spacing: -0.6px; }}
      .metricMain {{ fill: #FFFFFF; font-size: 104px; font-weight: 900; letter-spacing: -2.4px; }}
      .progressMetric {{ fill: #FFFFFF; font-size: 46px; font-weight: 900; letter-spacing: 0; }}
      .sectionTitle {{ fill: #FFFFFF; font-size: 36px; font-weight: 850; }}
      .positive {{ fill: #B7FF2A; font-size: 30px; font-weight: 750; }}
      .body {{ fill: #FFFFFF; font-size: 30px; font-weight: 600; }}
      .summary {{ fill: #FFFFFF; font-size: 26px; font-weight: 650; }}
      .mutedLine {{ stroke: #2A324A; stroke-width: 2; }}
      .card {{ fill: #151C2F; filter: url(#cardShadow); }}
      .outlineIcon {{ stroke: #B7FF2A; stroke-width: 5.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }}
      .iconOrange {{ stroke: #FF8A00; stroke-width: 5.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }}
    </style>
  </defs>
  <rect width="1080" height="1920" fill="url(#bgGradient)"/>
  <path d="M-60 236 C 120 124, 252 280, 408 188 C 582 86, 668 302, 824 210 C 940 142, 1034 206, 1150 120" stroke="#2A324A" stroke-width="4" stroke-opacity="0.42" fill="none"/>
  <path d="M-80 1720 C 92 1560, 250 1700, 420 1586 C 560 1494, 690 1650, 820 1534 C 936 1432, 1018 1510, 1164 1388" stroke="#2A324A" stroke-width="4" stroke-opacity="0.34" fill="none"/>
  <circle cx="408" cy="188" r="7" fill="#B7FF2A" fill-opacity="0.45"/><circle cx="824" cy="210" r="7" fill="#FF8A00" fill-opacity="0.45"/>
  <text x="70" y="216" class="font title">Týdenní běžecký report</text><text x="70" y="286" class="font subtitle">{_svg_text(report.week_label)}</text>
  {route_icon}
  <rect x="70" y="410" width="940" height="330" rx="38" class="card"/>
  <text x="118" y="525" class="font metricMain">{_svg_text(report.total_distance_label)}</text><text x="122" y="576" class="font small">naběháno tento týden</text><line x1="118" y1="628" x2="585" y2="628" class="mutedLine"/>
  {summary_markup}
  <g transform="translate(815 575)"><circle cx="0" cy="0" r="86" stroke="#2A324A" stroke-width="20"/><circle cx="0" cy="0" r="86" stroke="#B7FF2A" stroke-width="20" stroke-linecap="round" stroke-dasharray="{progress_dash} 540" transform="rotate(-90)"/><circle cx="0" cy="0" r="58" fill="#111A32" fill-opacity="0.86"/><text x="0" y="13" text-anchor="middle" class="font progressMetric">{_svg_text(report.completion_label)}</text><text x="0" y="132" text-anchor="middle" class="font small">splnění plánu</text></g>
  <rect x="70" y="790" width="455" height="180" rx="32" class="card"/><g transform="translate(110 828)"><path class="outlineIcon" d="M4 30 H44"/><path class="outlineIcon" d="M14 10 H34"/><path class="outlineIcon" d="M14 50 H34"/></g><text x="188" y="872" class="font metric">{_svg_text(report.completed_runs_label)}</text><text x="110" y="925" class="font small">tréninky</text>
  <rect x="555" y="790" width="455" height="180" rx="32" class="card"/><g transform="translate(595 824)"><circle class="outlineIcon" cx="28" cy="34" r="26"/><path class="outlineIcon" d="M28 34 L28 17"/><path class="outlineIcon" d="M28 34 L42 42"/></g><text x="673" y="872" class="font metric">{_svg_text(report.total_time_label)}</text><text x="595" y="925" class="font small">čas během</text>
  <rect x="70" y="1000" width="455" height="180" rx="32" class="card"/><g transform="translate(110 1038)"><path class="outlineIcon" d="M4 48 L18 28 L34 40 L52 12"/><path class="outlineIcon" d="M52 12 L52 32"/><path class="outlineIcon" d="M52 12 L32 12"/></g><text x="188" y="1082" class="font metric">{_svg_text(report.plan_actual_label)}</text><text x="110" y="1135" class="font small">plán vs. skutečnost</text>
  <rect x="555" y="1000" width="455" height="180" rx="32" class="card"/><g transform="translate(595 1038)"><path class="iconOrange" d="M4 48 C20 10,42 10,58 48"/><path class="iconOrange" d="M18 48 H44"/></g><text x="673" y="1082" class="font metric">{_svg_text(report.longest_run_label)}</text><text x="595" y="1135" class="font small">nejdelší běh</text>
  <rect x="70" y="1210" width="455" height="180" rx="32" class="card"/><g transform="translate(110 1248)"><path class="outlineIcon" d="M8 48 C18 18,38 18,48 48"/><path class="outlineIcon" d="M28 48 L42 26"/></g><text x="188" y="1292" class="font metric">{_svg_text(report.average_pace_label)}</text><text x="110" y="1345" class="font small">průměrné tempo</text>
  <rect x="555" y="1210" width="455" height="180" rx="32" class="card"/><g transform="translate(595 1248)"><path class="outlineIcon" d="M8 28 L22 42 L52 12"/><path class="outlineIcon" d="M8 56 H52"/></g><text x="673" y="1292" class="font metric">{_svg_text(report.session_adherence_label)}</text><text x="595" y="1345" class="font small">dodržení tréninků</text>
  <rect x="70" y="1440" width="940" height="210" rx="38" class="card"/><text x="115" y="1507" class="font sectionTitle">Objem týdne</text><text x="780" y="1507" class="font positive">{_svg_text(report.volume_delta_label)}</text>
  <text x="115" y="1575" class="font tiny">Plán</text><rect x="250" y="1548" width="610" height="32" rx="16" fill="#2A324A"/><rect x="250" y="1548" width="{planned_width}" height="32" rx="16" fill="#AAB2C8" fill-opacity="0.68"/><text x="880" y="1575" class="font tiny">{_svg_text(report.planned_distance_label)}</text>
  <text x="115" y="1630" class="font tiny">Skutečnost</text><rect x="250" y="1603" width="610" height="32" rx="16" fill="#2A324A"/><rect x="250" y="1603" width="{completed_width}" height="32" rx="16" fill="#B7FF2A"/><text x="880" y="1630" class="font tiny">{_svg_text(report.completed_distance_label)}</text>
  <rect x="70" y="1690" width="940" height="165" rx="38" class="card"/><text x="115" y="1754" class="font sectionTitle">Co se povedlo</text><circle cx="124" cy="1799" r="6" fill="#B7FF2A"/><text x="150" y="1808" class="font body">{_svg_text(report.win_lines[0])}</text><circle cx="124" cy="1838" r="6" fill="#B7FF2A"/><text x="150" y="1847" class="font body">{_svg_text(report.win_lines[1])}</text>
  <text x="540" y="1892" text-anchor="middle" class="font tiny">Běžecký plán • konzistence • vytrvalost • maraton 2026</text>
</svg>"""


def render_weekly_report_png(report: WeeklyReport) -> bytes:
    """Render a weekly report as PNG bytes."""
    import cairosvg

    return cairosvg.svg2png(
        bytestring=render_weekly_report_svg(report).encode("utf-8"),
        output_width=REPORT_WIDTH,
        output_height=REPORT_HEIGHT,
    )


def _covering_training_plan(session: Session, user_id: UUID, report_week_start: date) -> TrainingPlan | None:
    """Return the owner plan covering the selected report week."""
    return session.scalar(
        select(TrainingPlan)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.start_date <= report_week_start,
            TrainingPlan.end_date >= report_week_start,
        )
        .order_by((TrainingPlan.status == "active").desc(), TrainingPlan.start_date.desc())
        .limit(1)
    )


def _planned_workouts(
    session: Session,
    user_id: UUID,
    report_week_start: date,
    report_week_end: date,
) -> list[PlannedWorkout]:
    """Return deduplicated owner planned workouts for the report week."""
    workouts = list(
        session.scalars(
            select(PlannedWorkout)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= report_week_start,
                PlannedWorkout.scheduled_date <= report_week_end,
            )
            .order_by(PlannedWorkout.scheduled_date, PlannedWorkout.sort_order, PlannedWorkout.created_at)
        )
    )
    return deduplicate_planned_workouts_by_session(workouts)


def _running_activities(
    session: Session,
    user_id: UUID,
    timezone: str,
    report_week_start: date,
    report_week_end: date,
) -> list[Activity]:
    """Return owner running activities for the report week."""
    return list(
        session.scalars(
            select(Activity)
            .where(
                Activity.user_id == user_id,
                Activity.sport_type.in_(RUNNING_TYPES),
                Activity.start_time_utc >= start_of_day(report_week_start, timezone),
                Activity.start_time_utc < start_of_day(report_week_end + timedelta(days=1), timezone),
            )
            .order_by(Activity.start_time_utc)
        )
    )


def _report_plan_title(plan: TrainingPlan | None) -> str:
    """Return report plan title text."""
    return plan.title if plan is not None else "Běžecká příprava"


def _report_week_label(plan: TrainingPlan | None, report_week_start: date) -> str:
    """Return display label for the report week."""
    if plan is not None:
        plan_week_start = week_start(plan.start_date)
        week_number = ((report_week_start - plan_week_start).days // 7) + 1
        return f"Týden {max(1, week_number)}"
    return f"Týden {report_week_start.isocalendar().week}"


def _sum_decimal(values) -> Decimal:
    """Sum nullable decimal-like values."""
    return sum((value or Decimal("0") for value in values), Decimal("0"))


def _format_km(distance_m: Decimal) -> str:
    """Format meters as Czech kilometers with unit."""
    return f"{_format_km_value(distance_m)} km"


def _format_km_value(distance_m: Decimal) -> str:
    """Format meters as Czech kilometers without unit."""
    return f"{float(distance_m) / 1000:.1f}".replace(".", ",")


def _format_signed_km(distance_m: Decimal) -> str:
    """Format signed meters as Czech kilometers."""
    km = float(distance_m) / 1000
    prefix = "+" if km > 0 else ""
    return f"{prefix}{km:.1f} km".replace(".", ",")


def _format_duration(seconds: int) -> str:
    """Format seconds as hours and minutes."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours} h {minutes:02d} min"


def _format_pace(seconds: int, distance_m: Decimal) -> str:
    """Format average pace as minutes per kilometer."""
    distance_km = float(distance_m) / 1000
    if seconds <= 0 or distance_km <= 0:
        return '0:00"/km'
    pace_seconds = round(seconds / distance_km)
    minutes = pace_seconds // 60
    remaining_seconds = pace_seconds % 60
    return f'{minutes}:{remaining_seconds:02d}"/km'


def _summary_text(completed_sessions: int, completion_ratio: float) -> str:
    """Return a concise summary sentence for the report."""
    if completed_sessions == 0:
        return "Týden zatím čeká na první zaznamenaný běh."
    if completion_ratio >= 0.9:
        return "Silný týden s velmi dobrým plněním plánu."
    if completed_sessions == 3:
        return "Solidní týden se třemi kvalitními běhy."
    return f"Solidní týden s {completed_sessions} zaznamenanými běhy."


def _win_lines(completed_sessions: int, longest_run_m: float) -> tuple[str, str]:
    """Return two simple positive notes for the report."""
    first = "pravidelný pohyb a dobrý základ týdne" if completed_sessions else "jasný výchozí bod pro další týden"
    second = (
        "nejdelší běh dobře podpořil vytrvalost"
        if longest_run_m > 0
        else "plán je připravený pro další trénink"
    )
    return first, second


def _volume_bar_widths(planned_distance_m: float, completed_distance_m: float) -> tuple[int, int]:
    """Return proportional volume bar widths."""
    max_distance = max(planned_distance_m, completed_distance_m, 1)
    planned_width = round(610 * planned_distance_m / max_distance)
    completed_width = round(610 * completed_distance_m / max_distance)
    return planned_width, completed_width


def _route_map_pin_icon_svg() -> str:
    """Return the route map pin icon SVG group."""
    return """<g id="route-map-pin-icon" transform="translate(800 102) scale(0.82)" aria-label="Route map pin icon">
    <path d="M36 126c18-31 45-11 65-38 19-26 47-17 59-45 8-18 28-17 46-2" stroke="#A6FF1A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M169 45c0-19 15-34 34-34s34 15 34 34c0 24-34 62-34 62s-34-38-34-62Z" stroke="#FF941A" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="203" cy="45" r="11" stroke="#FF941A" stroke-width="7"/>
    <ellipse cx="75" cy="88" rx="9" ry="15" transform="rotate(32 75 88)" fill="#A6FF1A"/>
    <circle cx="65" cy="71" r="4" fill="#A6FF1A"/>
    <circle cx="72" cy="67" r="4" fill="#A6FF1A"/>
    <circle cx="80" cy="67" r="4" fill="#A6FF1A"/>
    <circle cx="88" cy="72" r="4" fill="#A6FF1A"/>
    <circle cx="36" cy="126" r="6" fill="#FF941A"/>
  </g>"""


def _wrap_svg_text(value: str, max_chars: int, max_lines: int) -> tuple[str, ...]:
    """Wrap text into short SVG-safe display lines."""
    words = value.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        candidate = f"{current_line} {word}".strip()
        if current_line and len(candidate) > max_chars:
            lines.append(current_line)
            current_line = word
        else:
            current_line = candidate
    if current_line:
        lines.append(current_line)
    return tuple(lines[:max_lines])


def _svg_text(value: str) -> str:
    """Escape text for safe SVG output."""
    return escape(value, quote=True)
