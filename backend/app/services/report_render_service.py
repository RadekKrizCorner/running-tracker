from __future__ import annotations

import base64
from functools import lru_cache
from html import escape
import math
from pathlib import Path
import re
import textwrap
from typing import Any

from app.core.exceptions import AppException

REPORT_WIDTH = 1080
REPORT_HEIGHT = 1920
REPORT_ASSET_DIR = Path(__file__).resolve().parents[1] / "assets"
DEFAULT_AVATAR_ASSET = REPORT_ASSET_DIR / "avatar_circle_orig.png"
HEADER_TITLE_MAX_WIDTH = 710
HEADER_TITLE_FONT_SIZE = 54
METRIC_VALUE_FONT_SIZE = 42
METRIC_VALUE_MIN_FONT_SIZE = 34
METRIC_VALUE_MAX_WIDTH = 360
METRIC_LABEL_FONT_SIZE = 24
METRIC_LABEL_MAX_WIDTH = 250
METRIC_CARD_WIDTH = 455
METRIC_ICON_SIZE = 88
METRIC_ICON_OFFSET_X = 184
VOLUME_BAR_WIDTH = 578
HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
REPORT_VARIANTS = {
    "default",
    "race_bib",
    "track_lines",
    "coach_notes",
    "medal_glow",
    "minimal_premium",
}
LEGACY_REPORT_VARIANTS = {"playful": "track_lines"}
DEFAULT_THEME = {
    "background": "#0B1020",
    "background_end": "#121B34",
    "surface": "#151C2F",
    "primary": "#B7FF2A",
    "secondary": "#FF8A00",
    "text": "#FFFFFF",
    "muted": "#AAB2C8",
    "stroke": "#2A324A",
    "card_stroke": "#28324B",
}
DEFAULT_SECTION_LABELS = {
    "volume": "Objem týdne",
    "went_well": "Co se povedlo",
    "focus_next": "Další fokus",
    "completion": "splnění plánu",
}


def render_report_svg(values: dict[str, Any], template: dict[str, Any] | None = None) -> str:
    """Render report values as an Instagram story SVG."""
    theme = _theme(template)
    variant = _variant(template)
    section_labels = _section_labels(template)
    summary = _wrapped_lines(values.get("summary_lines"), 3, 45)
    went_well = _fitted_lines(values.get("went_well"), 2, 36)
    focus_next = _fitted_lines(values.get("focus_next"), 2, 36)
    footer = _lines(values.get("footer"), 4)
    stats = values.get("stats") if isinstance(values.get("stats"), dict) else {}
    volume = values.get("volume") if isinstance(values.get("volume"), dict) else {}
    progress = _number(values.get("completion_percent"), 0, min_value=0, max_value=100)
    planned = _number(volume.get("planned"), 0, min_value=0)
    actual = _number(volume.get("actual"), 0, min_value=0)
    difference = _volume_difference(planned, actual)
    planned_width, actual_width = _volume_widths(planned, actual)
    return f"""<svg width="{REPORT_WIDTH}" height="{REPORT_HEIGHT}" viewBox="0 0 {REPORT_WIDTH} {REPORT_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg" data-report-variant="{variant}">
  <defs>
    <linearGradient id="reportBg" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{theme["background"]}"/><stop offset="1" stop-color="{theme["background_end"]}"/>
    </linearGradient>
    <radialGradient id="headerAvatarHalo" cx="45%" cy="42%" r="62%">
      <stop offset="0" stop-color="{theme["secondary"]}" stop-opacity="0.22"/>
      <stop offset="0.58" stop-color="{theme["stroke"]}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="{theme["background"]}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="headerAvatarClip"><circle cx="95" cy="95" r="88"/></clipPath>
    {_variant_defs(variant, theme)}
    <style>
      .font {{ font-family: Inter, SF Pro Display, Helvetica, Arial, sans-serif; }}
      .eyebrow {{ fill: {theme["primary"]}; font-size: 28px; font-weight: 800; letter-spacing: 1px; }}
      .title {{ fill: {theme["text"]}; font-size: {HEADER_TITLE_FONT_SIZE}px; font-weight: 900; }}
      .week {{ fill: {theme["secondary"]}; font-size: 42px; font-weight: 850; }}
      .muted {{ fill: {theme["muted"]}; font-size: 28px; font-weight: 600; }}
      .hero {{ fill: {theme["text"]}; font-size: 124px; font-weight: 950; }}
      .unit {{ fill: {theme["muted"]}; font-size: 46px; font-weight: 800; }}
      .card {{ fill: {theme["surface"]}; stroke: {theme["card_stroke"]}; stroke-width: 2; }}
      .metric {{ fill: {theme["text"]}; font-size: 42px; font-weight: 850; }}
      .metricLabel {{ fill: {theme["muted"]}; font-size: 24px; font-weight: 650; }}
      .metricIconHalo {{ fill: none; stroke: {theme["primary"]}; stroke-width: 2.8; opacity: 0.38; }}
      .metricIcon {{ stroke: {theme["primary"]}; stroke-width: 4.6; stroke-linecap: round; stroke-linejoin: round; fill: none; opacity: 0.94; }}
      .variantLine {{ stroke-linecap: round; stroke-linejoin: round; fill: none; }}
      .section {{ fill: {theme["text"]}; font-size: 36px; font-weight: 850; }}
      .body {{ fill: {theme["text"]}; font-size: 28px; font-weight: 620; }}
      .tiny {{ fill: {theme["muted"]}; font-size: 22px; font-weight: 600; }}
    </style>
  </defs>
  <rect width="1080" height="1920" fill="url(#reportBg)"/>
  {_variant_background(variant, theme)}
  <path d="M-80 230 C 120 90, 260 285, 430 178 C 580 84, 690 315, 845 205 C 950 132, 1035 200, 1160 112" stroke="{theme["stroke"]}" stroke-width="5" stroke-opacity="0.55" fill="none"/>
  <path d="M-110 1688 C 92 1560, 260 1704, 430 1586 C 570 1489, 700 1658, 830 1530 C 946 1418, 1030 1510, 1168 1388" stroke="{theme["stroke"]}" stroke-width="5" stroke-opacity="0.42" fill="none"/>

  <text x="70" y="160" class="font eyebrow">{_svg_text(values.get("program", "MARATONSKÁ PŘÍPRAVA"))}</text>
  {_header_title(values.get("title", "Týdenní běžecký report"))}
  <text x="70" y="304" class="font week">{_svg_text(values.get("week", "Týden"))}</text>
  {_header_avatar(theme)}

  <rect x="70" y="390" width="940" height="330" rx="34" class="card"/>
  <text x="122" y="530" class="font hero">{_svg_text(values.get("main_distance", "0,0"))}</text>
  <text x="430" y="530" class="font unit">{_svg_text(values.get("main_unit", "km"))}</text>
  <text x="126" y="588" class="font muted">{_svg_text(values.get("main_label", "naběháno tento týden"))}</text>
  <g transform="translate(830 550)">
    <circle cx="0" cy="0" r="88" stroke="{theme["stroke"]}" stroke-width="20"/>
    <circle cx="0" cy="0" r="88" stroke="{theme["primary"]}" stroke-width="20" stroke-linecap="round" stroke-dasharray="{_progress_dash(progress)} 553" transform="rotate(-90)"/>
    <text x="0" y="13" text-anchor="middle" class="font metric">{_svg_text(round(progress))}%</text>
    <text x="0" y="126" text-anchor="middle" class="font tiny">{_svg_text(section_labels["completion"])}</text>
  </g>

  {_metric_card(70, 770, "Tréninky", stats.get("runs", "0"), "runs")}
  {_metric_card(555, 770, "Čas během", stats.get("time", "0 h 00 min"), "time")}
  {_metric_card(70, 980, "Plán vs. skutečnost", stats.get("plan_vs_actual", "0,0 / 0,0 km"), "volume")}
  {_metric_card(555, 980, "Nejdelší běh", stats.get("longest_run", "0,0 km"), "longest")}
  {_metric_card(70, 1190, "Průměrné tempo", stats.get("avg_pace", "0:00 min/km"), "pace")}
  {_metric_card(555, 1190, "Dodržení tréninků", stats.get("training_adherence", "0/0"), "adherence")}

  <rect x="70" y="1420" width="940" height="220" rx="34" class="card"/>
  <text x="118" y="1490" class="font section">{_svg_text(section_labels["volume"])}</text>
  {_volume_difference_text(difference, 970, 1490)}
  <text x="106" y="1563" class="font tiny">Plán</text>
  <rect x="282" y="1535" width="{VOLUME_BAR_WIDTH}" height="32" rx="16" fill="{theme["stroke"]}"/>
  <rect x="282" y="1535" width="{planned_width}" height="32" rx="16" fill="{theme["muted"]}"/>
  {_volume_value_text("planned", 980, 1563, _km(planned))}
  <text x="106" y="1623" class="font tiny">Skutečnost</text>
  <rect x="282" y="1595" width="{VOLUME_BAR_WIDTH}" height="32" rx="16" fill="{theme["stroke"]}"/>
  <rect x="282" y="1595" width="{actual_width}" height="32" rx="16" fill="{theme["primary"]}"/>
  {_volume_value_text("actual", 980, 1623, _km(actual))}

  <rect x="70" y="1685" width="455" height="155" rx="30" class="card"/>
  <text x="112" y="1742" class="font section">{_svg_text(section_labels["went_well"])}</text>
  {_bullet_lines(went_well, 112, 1785, theme)}
  <rect x="555" y="1685" width="455" height="155" rx="30" class="card"/>
  <text x="597" y="1742" class="font section">{_svg_text(section_labels["focus_next"])}</text>
  {_bullet_lines(focus_next, 597, 1785, theme)}
  {_summary_lines(summary, 118, 640)}
  <text x="540" y="1896" text-anchor="middle" class="font tiny">{_svg_text(" • ".join(footer))}</text>
</svg>"""


def render_report_png(values: dict[str, Any], template: dict[str, Any] | None = None) -> bytes:
    """Render report values as PNG bytes."""
    try:
        import cairosvg

        return cairosvg.svg2png(
            bytestring=render_report_svg(values, template).encode("utf-8"),
            output_width=REPORT_WIDTH,
            output_height=REPORT_HEIGHT,
        )
    except (ImportError, OSError) as exc:
        raise AppException(
            503,
            "REPORT_PNG_RENDER_UNAVAILABLE",
            "PNG rendering requires Cairo native libraries to be installed",
        ) from exc


def _theme(template: dict[str, Any] | None) -> dict[str, str]:
    """Return sanitized render theme colors."""
    theme = dict(DEFAULT_THEME)
    source = template.get("theme") if isinstance(template, dict) else None
    if not isinstance(source, dict):
        return theme
    for key in theme:
        value = source.get(key)
        if isinstance(value, str) and HEX_COLOR_PATTERN.fullmatch(value.strip()):
            theme[key] = value.strip().upper()
    return theme


def _section_labels(template: dict[str, Any] | None) -> dict[str, str]:
    """Return render section labels from template metadata."""
    labels = dict(DEFAULT_SECTION_LABELS)
    sections = template.get("sections") if isinstance(template, dict) else None
    if not isinstance(sections, list):
        return labels
    for section in sections:
        if not isinstance(section, dict):
            continue
        section_id = section.get("id")
        label = section.get("label")
        if isinstance(section_id, str) and section_id in labels and isinstance(label, str) and label.strip():
            labels[section_id] = label.strip()[:80]
    return labels


def _variant(template: dict[str, Any] | None) -> str:
    """Return the sanitized report visual variant."""
    theme = template.get("theme") if isinstance(template, dict) else None
    variant = theme.get("variant") if isinstance(theme, dict) else None
    if variant is None and isinstance(template, dict):
        variant = template.get("variant")
    if isinstance(variant, str):
        normalized_variant = variant.strip().lower()
        if normalized_variant in LEGACY_REPORT_VARIANTS:
            return LEGACY_REPORT_VARIANTS[normalized_variant]
        if normalized_variant in REPORT_VARIANTS:
            return normalized_variant
    return "default"


def _variant_defs(variant: str, theme: dict[str, str]) -> str:
    """Return optional SVG definitions for report variants."""
    if variant == "medal_glow":
        return f"""<radialGradient id="medalGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="{theme["primary"]}" stop-opacity="0.26"/>
      <stop offset="0.52" stop-color="{theme["secondary"]}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="{theme["background"]}" stop-opacity="0"/>
    </radialGradient>"""
    if variant == "race_bib":
        return f"""<pattern id="raceBibPerforation" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="2.8" fill="{theme["muted"]}" opacity="0.22"/>
    </pattern>"""
    if variant == "coach_notes":
        return f"""<pattern id="coachNoteRules" width="100" height="42" patternUnits="userSpaceOnUse">
      <path d="M0 41 H100" stroke="{theme["muted"]}" stroke-width="1.4" stroke-opacity="0.18"/>
    </pattern>"""
    return ""


def _variant_background(variant: str, theme: dict[str, str]) -> str:
    """Return optional SVG background accents for a report variant."""
    if variant == "race_bib":
        return _race_bib_accent(theme)
    if variant == "track_lines":
        return _track_lines_accent(theme)
    if variant == "coach_notes":
        return _coach_notes_accent(theme)
    if variant == "medal_glow":
        return _medal_glow_accent(theme)
    if variant == "minimal_premium":
        return _minimal_premium_accent(theme)
    return ""


def _race_bib_accent(theme: dict[str, str]) -> str:
    """Return a race-bib inspired report accent."""
    return f"""<g data-report-accent="race-bib">
    <rect x="54" y="344" width="972" height="394" rx="44" fill="url(#raceBibPerforation)" opacity="0.46"/>
    <rect x="84" y="356" width="912" height="34" rx="17" fill="{theme["primary"]}" opacity="0.10"/>
    <path class="variantLine" d="M100 374 H980" stroke="{theme["primary"]}" stroke-width="3" stroke-dasharray="18 18" opacity="0.32"/>
    <path class="variantLine" d="M118 724 H962" stroke="{theme["secondary"]}" stroke-width="3" stroke-dasharray="10 20" opacity="0.24"/>
    <circle cx="122" cy="374" r="11" fill="{theme["background"]}" stroke="{theme["primary"]}" stroke-width="2" opacity="0.72"/>
    <circle cx="958" cy="374" r="11" fill="{theme["background"]}" stroke="{theme["primary"]}" stroke-width="2" opacity="0.72"/>
  </g>"""


def _track_lines_accent(theme: dict[str, str]) -> str:
    """Return a track-lane inspired report accent."""
    return f"""<g data-report-accent="track-lines">
    <path class="variantLine" d="M-120 360 C 180 260, 308 474, 544 374 C 780 274, 900 430, 1210 316" stroke="{theme["primary"]}" stroke-width="7" opacity="0.12"/>
    <path class="variantLine" d="M-132 407 C 168 307, 316 520, 552 420 C 788 320, 904 474, 1220 362" stroke="{theme["secondary"]}" stroke-width="4" opacity="0.20"/>
    <path class="variantLine" d="M-92 1470 C 178 1376, 354 1530, 574 1438 C 788 1348, 914 1474, 1180 1388" stroke="{theme["primary"]}" stroke-width="6" opacity="0.13"/>
    <path class="variantLine" d="M-86 1518 C 182 1426, 360 1576, 580 1486 C 792 1398, 920 1520, 1180 1438" stroke="{theme["secondary"]}" stroke-width="3" opacity="0.18"/>
  </g>"""


def _coach_notes_accent(theme: dict[str, str]) -> str:
    """Return a coach-notes inspired report accent."""
    return f"""<g data-report-accent="coach-notes">
    <rect x="70" y="391" width="940" height="328" rx="34" fill="url(#coachNoteRules)" opacity="0.36"/>
    <path class="variantLine" d="M96 740 H984" stroke="{theme["muted"]}" stroke-width="1.5" stroke-dasharray="2 16" opacity="0.24"/>
    <path class="variantLine" d="M86 1672 H510 M572 1672 H994" stroke="{theme["muted"]}" stroke-width="1.5" stroke-dasharray="2 15" opacity="0.24"/>
    <path class="variantLine" d="M888 315 L914 338 L966 284" stroke="{theme["primary"]}" stroke-width="7" opacity="0.22"/>
    <rect x="92" y="333" width="126" height="18" rx="9" fill="{theme["secondary"]}" opacity="0.22"/>
  </g>"""


def _medal_glow_accent(theme: dict[str, str]) -> str:
    """Return a medal-inspired report accent."""
    return f"""<g data-report-accent="medal-glow">
    <circle cx="830" cy="550" r="170" fill="url(#medalGlow)"/>
    <circle cx="830" cy="550" r="112" fill="none" stroke="{theme["primary"]}" stroke-width="2.5" stroke-opacity="0.22"/>
    <circle cx="830" cy="550" r="135" fill="none" stroke="{theme["secondary"]}" stroke-width="1.8" stroke-opacity="0.18"/>
    <path d="M876 214 L904 294 L924 214" fill="{theme["secondary"]}" opacity="0.18"/>
    <path d="M930 214 L906 294 L986 238" fill="{theme["primary"]}" opacity="0.14"/>
  </g>"""


def _minimal_premium_accent(theme: dict[str, str]) -> str:
    """Return a minimal premium report accent."""
    return f"""<g data-report-accent="minimal-premium">
    <path class="variantLine" d="M70 350 H222 M858 350 H1010 M70 1652 H222 M858 1652 H1010" stroke="{theme["primary"]}" stroke-width="2.4" opacity="0.35"/>
    <path class="variantLine" d="M70 350 V502 M1010 350 V502 M70 1500 V1652 M1010 1500 V1652" stroke="{theme["muted"]}" stroke-width="1.8" opacity="0.18"/>
    <path class="variantLine" d="M118 738 H962 M118 1402 H962" stroke="{theme["muted"]}" stroke-width="1.5" opacity="0.16"/>
  </g>"""


def _metric_card(x: int, y: int, label: str, value: Any, icon_name: str) -> str:
    """Return one metric card SVG block."""
    center_x = x + round(METRIC_CARD_WIDTH / 2)
    return f"""<rect x="{x}" y="{y}" width="{METRIC_CARD_WIDTH}" height="170" rx="30" class="card"/>
  {_metric_icon(icon_name, x + METRIC_ICON_OFFSET_X, y)}
  {_metric_value(center_x, y + 128, label, value)}
  {_metric_label(center_x, y + 158, label)}"""


def _metric_value(x: int, y: int, label: str, value: Any) -> str:
    """Return a centered metric value text element fitted inside the card."""
    text = str(value)
    fit_attrs = _metric_value_fit_attrs(text)
    return (
        f'<text x="{x}" y="{y}" data-report-metric-value="{_svg_text(label)}" text-anchor="middle"'
        f'{fit_attrs} class="font metric">{_svg_text(text)}</text>'
    )


def _metric_label(x: int, y: int, label: str) -> str:
    """Return a centered metric label fitted inside the card."""
    fit_attrs = _text_fit_attrs(str(label), METRIC_LABEL_MAX_WIDTH, METRIC_LABEL_FONT_SIZE, always_text_length=True)
    return (
        f'<text x="{x}" y="{y}" data-report-metric-label="{_svg_text(label)}" text-anchor="middle"'
        f'{fit_attrs} class="font metricLabel">{_svg_text(label)}</text>'
    )


def _metric_value_fit_attrs(value: str) -> str:
    """Return inline metric value fitting attributes for long values."""
    return _text_fit_attrs(value, METRIC_VALUE_MAX_WIDTH, METRIC_VALUE_FONT_SIZE, METRIC_VALUE_MIN_FONT_SIZE)


def _metric_icon(icon_name: str, x: int, y: int) -> str:
    """Return an integrated SVG icon for one metric card."""
    paths = {
        "runs": '<circle cx="30" cy="19" r="5"/><path d="M17 49 C27 52 41 52 56 47"/><path d="M19 44 L29 27 L43 43 L57 42"/>',
        "time": '<circle cx="36" cy="36" r="22"/><path d="M36 22 V37 L48 44"/><path d="M27 12 H45"/>',
        "volume": '<path d="M17 52 H57"/><path d="M22 47 V35"/><path d="M36 47 V20"/><path d="M50 47 V28"/>',
        "longest": '<path d="M17 52 C25 28 40 59 52 27"/><path d="M52 27 L52 17 L62 22 L52 27"/>',
        "pace": '<path d="M16 48 A23 23 0 1 1 56 48"/><path d="M36 47 L50 26"/><path d="M24 51 H48"/>',
        "adherence": '<path d="M20 26 L28 34 L43 18"/><path d="M20 49 L29 58 L55 31"/>',
    }
    icon_path = paths.get(icon_name, paths["volume"])
    return f"""<g data-report-icon="{_svg_text(icon_name)}" data-report-icon-size="{METRIC_ICON_SIZE}" transform="translate({x} {y})">
    <circle cx="44" cy="44" r="34" class="metricIconHalo"/>
    <g class="metricIcon" transform="translate(8 8)">{icon_path}</g>
  </g>"""


def _header_title(value: Any) -> str:
    """Return the report header title constrained before the avatar."""
    text = str(value)
    fit_attrs = _text_fit_attrs(text, HEADER_TITLE_MAX_WIDTH, HEADER_TITLE_FONT_SIZE)
    return f'<text x="70" y="238" data-report-title="header" class="font title"{fit_attrs}>{_svg_text(text)}</text>'


def _text_fit_attrs(
    value: str,
    max_width: int,
    font_size: int,
    min_font_size: int | None = None,
    always_text_length: bool = False,
) -> str:
    """Return SVG text fitting attributes when text is estimated too wide."""
    estimated_width = _estimated_text_width(value, font_size)
    if estimated_width <= max_width:
        if always_text_length:
            return f' textLength="{round(max(1, estimated_width))}" lengthAdjust="spacingAndGlyphs"'
        return ""
    fitted_size = font_size
    if min_font_size is not None:
        fitted_size = max(min_font_size, math.floor(font_size * max_width / estimated_width))
        estimated_width = _estimated_text_width(value, fitted_size)
    attrs = f' style="font-size: {fitted_size}px"' if fitted_size != font_size else ""
    if estimated_width > max_width or always_text_length:
        attrs += f' textLength="{max_width}" lengthAdjust="spacingAndGlyphs"'
    return attrs


def _estimated_text_width(value: str, font_size: int) -> float:
    """Return an estimated SVG text width."""
    return sum(_character_width_factor(character) for character in value) * font_size


def _character_width_factor(character: str) -> float:
    """Return an approximate width factor for one character."""
    if character.isspace():
        return 0.34
    if character in "ijlI.,:;!'|":
        return 0.3
    if character in "mwMW@#%&":
        return 0.84
    if character.isdigit():
        return 0.58
    if character.isupper():
        return 0.66
    return 0.56


def _header_avatar(theme: dict[str, str]) -> str:
    """Return the report header avatar SVG block."""
    avatar_markup = _header_avatar_image() or _header_avatar_fallback(theme)
    return f"""<g data-report-avatar="header" data-report-avatar-style="reference-clip" transform="translate(820 42)">
    <circle cx="95" cy="95" r="99" fill="url(#headerAvatarHalo)"/>
    <circle cx="95" cy="95" r="89" fill="{theme["background"]}" opacity="0.16"/>
    {avatar_markup}
    <circle data-report-avatar-ring="styled" cx="95" cy="95" r="88" fill="none" stroke="{theme["muted"]}" stroke-width="1.6" stroke-opacity="0.34"/>
    <circle cx="95" cy="95" r="82" fill="none" stroke="{theme["primary"]}" stroke-width="3" stroke-opacity="0.72"/>
  </g>"""


def _header_avatar_image() -> str | None:
    """Return embedded avatar image SVG markup when the asset exists."""
    avatar_uri = _avatar_data_uri()
    if avatar_uri is None:
        return None
    return (
        f'<image data-report-avatar-source="asset" href="{avatar_uri}" x="-15" y="-15" '
        'width="220" height="220" preserveAspectRatio="xMidYMid slice" clip-path="url(#headerAvatarClip)"/>'
    )


def _header_avatar_fallback(theme: dict[str, str]) -> str:
    """Return fallback avatar SVG markup when no image asset is available."""
    return (
        f'<circle data-report-avatar-source="fallback" cx="95" cy="95" r="82" fill="{theme["surface"]}" '
        f'stroke="{theme["stroke"]}" stroke-width="2"/>'
        f'<text x="95" y="111" text-anchor="middle" class="font metric" fill="{theme["primary"]}">RT</text>'
    )


@lru_cache
def _avatar_data_uri() -> str | None:
    """Return the bundled avatar PNG as a data URI."""
    if not DEFAULT_AVATAR_ASSET.exists():
        return None
    encoded = base64.b64encode(DEFAULT_AVATAR_ASSET.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _summary_lines(lines: list[str], x: int, y: int) -> str:
    """Return summary text SVG lines."""
    return "".join(
        f'<text x="{x}" y="{y + (index * 30)}" class="font body">{_svg_text(line)}</text>'
        for index, line in enumerate(lines)
    )


def _bullet_lines(lines: list[str], x: int, y: int, theme: dict[str, str]) -> str:
    """Return bullet text SVG lines."""
    return "".join(
        f'<circle cx="{x}" cy="{y + (index * 32) - 8}" r="5" fill="{theme["primary"]}"/>'
        f'<text x="{x + 22}" y="{y + (index * 32)}" class="font tiny">{_svg_text(line)}</text>'
        for index, line in enumerate(lines)
    )


def _volume_difference_text(value: float, x: int, y: int) -> str:
    """Return the fitted volume difference SVG text."""
    text = _signed_km(value)
    fit_attrs = _text_fit_attrs(text, 190, METRIC_VALUE_FONT_SIZE, METRIC_VALUE_MIN_FONT_SIZE)
    return f'<text x="{x}" y="{y}" text-anchor="end"{fit_attrs} class="font metric">{_svg_text(text)}</text>'


def _volume_value_text(name: str, x: int, y: int, value: str) -> str:
    """Return one fitted volume value SVG text."""
    fit_attrs = _text_fit_attrs(value, 112, 22, 16)
    return (
        f'<text x="{x}" y="{y}" data-report-volume-value="{_svg_text(name)}" text-anchor="end"'
        f'{fit_attrs} class="font tiny">{_svg_text(value)}</text>'
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


def _wrapped_lines(value: Any, max_lines: int, line_width: int) -> list[str]:
    """Return normalized text wrapped to a limited number of lines."""
    wrapped: list[str] = []
    for line in _lines(value, max_lines):
        chunks = textwrap.wrap(
            line,
            width=line_width,
            break_long_words=False,
            break_on_hyphens=False,
        )
        wrapped.extend(chunks or [line])
        if len(wrapped) >= max_lines:
            break
    if len(wrapped) > max_lines:
        wrapped = wrapped[:max_lines]
    return wrapped


def _fitted_lines(value: Any, max_lines: int, max_chars: int) -> list[str]:
    """Return normalized text shortened to fit fixed SVG cards."""
    return [_truncate_line(line, max_chars) for line in _lines(value, max_lines)]


def _truncate_line(value: str, max_chars: int) -> str:
    """Return one text line shortened without cutting mid-word when possible."""
    if len(value) <= max_chars:
        return value
    shortened = textwrap.shorten(
        value,
        width=max_chars,
        placeholder="...",
        break_long_words=False,
        break_on_hyphens=False,
    )
    if shortened:
        return shortened
    return f"{value[: max(0, max_chars - 3)].rstrip()}..."


def _progress_dash(percent: float) -> int:
    """Return progress circle dash length."""
    safe_percent = _number(percent, 0, min_value=0, max_value=100)
    return round(553 * safe_percent / 100)


def _volume_widths(planned: float, actual: float) -> tuple[int, int]:
    """Return proportional volume bar widths."""
    planned = _number(planned, 0, min_value=0)
    actual = _number(actual, 0, min_value=0)
    max_value = max(planned, actual, 1)
    return round(VOLUME_BAR_WIDTH * planned / max_value), round(VOLUME_BAR_WIDTH * actual / max_value)


def _volume_difference(planned: float, actual: float) -> float:
    """Return actual-minus-planned volume difference."""
    return round(_number(actual, 0, min_value=0) - _number(planned, 0, min_value=0), 1)


def _number(
    value: Any,
    fallback: float,
    min_value: float | None = None,
    max_value: float | None = None,
) -> float:
    """Return a float value from untrusted report data."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    if not math.isfinite(number):
        number = fallback
    if min_value is not None:
        number = max(number, min_value)
    if max_value is not None:
        number = min(number, max_value)
    return number


def _km(value: float) -> str:
    """Format kilometers with a Czech decimal separator."""
    value = _number(value, 0)
    return f"{value:.1f} km".replace(".", ",")


def _signed_km(value: Any) -> str:
    """Format a signed kilometer difference."""
    number = _number(value, 0)
    prefix = "+" if number > 0 else ""
    return f"{prefix}{number:.1f} km".replace(".", ",")


def _svg_text(value: Any) -> str:
    """Escape a value for safe SVG text output."""
    return escape(str(value), quote=True)
