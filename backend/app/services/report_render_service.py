from __future__ import annotations

from html import escape
from typing import Any

REPORT_WIDTH = 1080
REPORT_HEIGHT = 1920


def render_report_svg(values: dict[str, Any]) -> str:
    """Render report values as an Instagram story SVG."""
    summary = _lines(values.get("summary_lines"), 3)
    went_well = _lines(values.get("went_well"), 3)
    focus_next = _lines(values.get("focus_next"), 3)
    footer = _lines(values.get("footer"), 4)
    stats = values.get("stats") if isinstance(values.get("stats"), dict) else {}
    volume = values.get("volume") if isinstance(values.get("volume"), dict) else {}
    progress = _number(values.get("completion_percent"), 0)
    planned = _number(volume.get("planned"), 0)
    actual = _number(volume.get("actual"), 0)
    planned_width, actual_width = _volume_widths(planned, actual)
    return f"""<svg width="{REPORT_WIDTH}" height="{REPORT_HEIGHT}" viewBox="0 0 {REPORT_WIDTH} {REPORT_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="reportBg" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0B1020"/><stop offset="1" stop-color="#121B34"/>
    </linearGradient>
    <style>
      .font {{ font-family: Inter, SF Pro Display, Helvetica, Arial, sans-serif; }}
      .eyebrow {{ fill: #B7FF2A; font-size: 28px; font-weight: 800; letter-spacing: 1px; }}
      .title {{ fill: #FFFFFF; font-size: 62px; font-weight: 900; }}
      .week {{ fill: #FF8A00; font-size: 42px; font-weight: 850; }}
      .muted {{ fill: #AAB2C8; font-size: 28px; font-weight: 600; }}
      .hero {{ fill: #FFFFFF; font-size: 124px; font-weight: 950; }}
      .unit {{ fill: #AAB2C8; font-size: 46px; font-weight: 800; }}
      .card {{ fill: #151C2F; stroke: #28324B; stroke-width: 2; }}
      .metric {{ fill: #FFFFFF; font-size: 42px; font-weight: 850; }}
      .metricLabel {{ fill: #AAB2C8; font-size: 24px; font-weight: 650; }}
      .section {{ fill: #FFFFFF; font-size: 36px; font-weight: 850; }}
      .body {{ fill: #FFFFFF; font-size: 28px; font-weight: 620; }}
      .tiny {{ fill: #AAB2C8; font-size: 22px; font-weight: 600; }}
    </style>
  </defs>
  <rect width="1080" height="1920" fill="url(#reportBg)"/>
  <path d="M-80 230 C 120 90, 260 285, 430 178 C 580 84, 690 315, 845 205 C 950 132, 1035 200, 1160 112" stroke="#2A324A" stroke-width="5" stroke-opacity="0.55" fill="none"/>
  <path d="M-110 1688 C 92 1560, 260 1704, 430 1586 C 570 1489, 700 1658, 830 1530 C 946 1418, 1030 1510, 1168 1388" stroke="#2A324A" stroke-width="5" stroke-opacity="0.42" fill="none"/>

  <text x="70" y="160" class="font eyebrow">{_svg_text(values.get("program", "MARATONSKÁ PŘÍPRAVA"))}</text>
  <text x="70" y="238" class="font title">{_svg_text(values.get("title", "Týdenní běžecký report"))}</text>
  <text x="70" y="304" class="font week">{_svg_text(values.get("week", "Týden"))}</text>

  <rect x="70" y="390" width="940" height="330" rx="34" class="card"/>
  <text x="122" y="530" class="font hero">{_svg_text(values.get("main_distance", "0,0"))}</text>
  <text x="430" y="530" class="font unit">{_svg_text(values.get("main_unit", "km"))}</text>
  <text x="126" y="588" class="font muted">{_svg_text(values.get("main_label", "naběháno tento týden"))}</text>
  <g transform="translate(830 550)">
    <circle cx="0" cy="0" r="88" stroke="#2A324A" stroke-width="20"/>
    <circle cx="0" cy="0" r="88" stroke="#B7FF2A" stroke-width="20" stroke-linecap="round" stroke-dasharray="{_progress_dash(progress)} 553" transform="rotate(-90)"/>
    <text x="0" y="13" text-anchor="middle" class="font metric">{_svg_text(round(progress))}%</text>
    <text x="0" y="126" text-anchor="middle" class="font tiny">splnění plánu</text>
  </g>

  {_metric_card(70, 770, "Tréninky", stats.get("runs", "0"))}
  {_metric_card(555, 770, "Čas během", stats.get("time", "0 h 00 min"))}
  {_metric_card(70, 980, "Plán vs. skutečnost", stats.get("plan_vs_actual", "0,0 / 0,0 km"))}
  {_metric_card(555, 980, "Nejdelší běh", stats.get("longest_run", "0,0 km"))}
  {_metric_card(70, 1190, "Průměrné tempo", stats.get("avg_pace", "0:00 min/km"))}
  {_metric_card(555, 1190, "Dodržení tréninků", stats.get("training_adherence", "0/0"))}

  <rect x="70" y="1420" width="940" height="220" rx="34" class="card"/>
  <text x="118" y="1490" class="font section">Objem týdne</text>
  <text x="804" y="1490" class="font metric">{_svg_text(_signed_km(volume.get("difference", 0)))}</text>
  <text x="118" y="1560" class="font tiny">Plán</text>
  <rect x="250" y="1532" width="610" height="32" rx="16" fill="#2A324A"/>
  <rect x="250" y="1532" width="{planned_width}" height="32" rx="16" fill="#AAB2C8"/>
  <text x="880" y="1560" class="font tiny">{_svg_text(_km(planned))}</text>
  <text x="118" y="1615" class="font tiny">Skutečnost</text>
  <rect x="250" y="1587" width="610" height="32" rx="16" fill="#2A324A"/>
  <rect x="250" y="1587" width="{actual_width}" height="32" rx="16" fill="#B7FF2A"/>
  <text x="880" y="1615" class="font tiny">{_svg_text(_km(actual))}</text>

  <rect x="70" y="1685" width="455" height="155" rx="30" class="card"/>
  <text x="112" y="1742" class="font section">Co se povedlo</text>
  {_bullet_lines(went_well, 112, 1785)}
  <rect x="555" y="1685" width="455" height="155" rx="30" class="card"/>
  <text x="597" y="1742" class="font section">Další fokus</text>
  {_bullet_lines(focus_next, 597, 1785)}
  {_summary_lines(summary, 118, 662)}
  <text x="540" y="1896" text-anchor="middle" class="font tiny">{_svg_text(" • ".join(footer))}</text>
</svg>"""


def render_report_png(values: dict[str, Any]) -> bytes:
    """Render report values as PNG bytes."""
    import cairosvg

    return cairosvg.svg2png(
        bytestring=render_report_svg(values).encode("utf-8"),
        output_width=REPORT_WIDTH,
        output_height=REPORT_HEIGHT,
    )


def _metric_card(x: int, y: int, label: str, value: Any) -> str:
    """Return one metric card SVG block."""
    return f"""<rect x="{x}" y="{y}" width="455" height="170" rx="30" class="card"/>
  <text x="{x + 42}" y="{y + 76}" class="font metric">{_svg_text(value)}</text>
  <text x="{x + 42}" y="{y + 124}" class="font metricLabel">{_svg_text(label)}</text>"""


def _summary_lines(lines: list[str], x: int, y: int) -> str:
    """Return summary text SVG lines."""
    return "".join(
        f'<text x="{x}" y="{y + (index * 36)}" class="font body">{_svg_text(line)}</text>'
        for index, line in enumerate(lines)
    )


def _bullet_lines(lines: list[str], x: int, y: int) -> str:
    """Return bullet text SVG lines."""
    return "".join(
        f'<circle cx="{x}" cy="{y + (index * 32) - 8}" r="5" fill="#B7FF2A"/>'
        f'<text x="{x + 22}" y="{y + (index * 32)}" class="font tiny">{_svg_text(line)}</text>'
        for index, line in enumerate(lines[:2])
    )


def _lines(value: Any, max_lines: int) -> list[str]:
    """Return a normalized list of text lines."""
    if isinstance(value, str):
        lines = [line.strip() for line in value.splitlines() if line.strip()]
    elif isinstance(value, list):
        lines = [str(line).strip() for line in value if str(line).strip()]
    else:
        lines = []
    return lines[:max_lines]


def _progress_dash(percent: float) -> int:
    """Return progress circle dash length."""
    return round(553 * max(0, min(percent, 100)) / 100)


def _volume_widths(planned: float, actual: float) -> tuple[int, int]:
    """Return proportional volume bar widths."""
    max_value = max(planned, actual, 1)
    return round(610 * planned / max_value), round(610 * actual / max_value)


def _number(value: Any, fallback: float) -> float:
    """Return a float value from untrusted report data."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _km(value: float) -> str:
    """Format kilometers with a Czech decimal separator."""
    return f"{value:.1f} km".replace(".", ",")


def _signed_km(value: Any) -> str:
    """Format a signed kilometer difference."""
    number = _number(value, 0)
    prefix = "+" if number > 0 else ""
    return f"{prefix}{number:.1f} km".replace(".", ",")


def _svg_text(value: Any) -> str:
    """Escape a value for safe SVG text output."""
    return escape(str(value), quote=True)
