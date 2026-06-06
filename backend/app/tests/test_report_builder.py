from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.exceptions import AppException
from app.tests.conftest import setup_and_login


def test_report_template_lookup_is_owner_scoped(client: TestClient) -> None:
    """Verify report template lookup never crosses owner boundaries."""
    from app.db.session import get_session_factory
    from app.models import User
    from app.schemas.report import ReportTemplateCreate
    from app.services.report_template_service import create_report_template, get_report_template_for_user

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        other_user = User(email="other@example.com", timezone="Europe/Prague", units="metric")
        session.add(other_user)
        session.commit()
        session.refresh(other_user)

        template = create_report_template(session, owner.id, ReportTemplateCreate(**_template_payload("Owner Story")))

        assert get_report_template_for_user(session, owner.id, template.id).id == template.id
        with pytest.raises(AppException) as exc_info:
            get_report_template_for_user(session, other_user.id, template.id)

    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "REPORT_TEMPLATE_NOT_FOUND"


def test_weekly_report_prefill_uses_owner_week_data(client: TestClient) -> None:
    """Verify report prefill uses owner-scoped planned and completed week data."""
    from app.db.session import get_session_factory
    from app.models import User
    from app.services.report_prefill_service import build_weekly_report_prefill

    _seed_report_builder_week(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None

        values = build_weekly_report_prefill(session, owner, date(2026, 5, 18))

    assert values["program"] == "MARATONSKÁ PŘÍPRAVA"
    assert values["title"] == "Týdenní běžecký report"
    assert values["week"] == "Týden 1"
    assert values["main_distance"] == "25,4"
    assert values["main_unit"] == "km"
    assert values["completion_percent"] == 55
    assert values["stats"]["runs"] == "3"
    assert values["stats"]["time"] == "3 h 06 min"
    assert values["stats"]["plan_vs_actual"] == "46,0 / 25,4 km"
    assert values["stats"]["longest_run"] == "9,0 km"
    assert values["stats"]["avg_pace"] == "7:20 min/km"
    assert values["stats"]["training_adherence"] == "3/5"
    assert values["volume"] == {"planned": 46.0, "actual": 25.4, "difference": -20.6}
    assert values["summary_lines"]
    assert values["went_well"]
    assert values["focus_next"]
    assert values["footer"]


def test_report_template_api_is_owner_scoped(client: TestClient) -> None:
    """Verify template API lists owner data and hides foreign templates."""
    from app.db.session import get_session_factory
    from app.models import ReportTemplate, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        other_user = User(email="other@example.com", timezone="Europe/Prague", units="metric")
        session.add(other_user)
        session.flush()
        foreign_template = ReportTemplate(user_id=other_user.id, **_template_model_payload("Foreign Story"))
        session.add(foreign_template)
        session.commit()
        foreign_template_id = str(foreign_template.id)

    create_response = client.post("/api/v1/report-templates", json=_template_payload("Owner Story"))
    assert create_response.status_code == 200
    assert create_response.json()["name"] == "Owner Story"

    list_response = client.get("/api/v1/report-templates")
    assert list_response.status_code == 200
    names = {item["name"] for item in list_response.json()}
    assert "Owner Story" in names
    assert "Foreign Story" not in names

    foreign_response = client.get(f"/api/v1/report-templates/{foreign_template_id}")
    assert foreign_response.status_code == 404
    assert foreign_response.json()["code"] == "REPORT_TEMPLATE_NOT_FOUND"


def test_report_prefill_and_render_endpoints_return_social_outputs(client: TestClient) -> None:
    """Verify prefill and render endpoints return editable values and images."""
    _seed_report_builder_week(client)

    prefill_response = client.post("/api/v1/reports/prefill", json={"week_start_date": "2026-05-18"})
    assert prefill_response.status_code == 200
    payload = prefill_response.json()
    assert payload["period_start"] == "2026-05-18"
    assert payload["period_end"] == "2026-05-24"
    assert payload["values"]["main_distance"] == "25,4"
    assert payload["values"]["stats"]["plan_vs_actual"] == "46,0 / 25,4 km"

    render_payload = {"values": payload["values"]}
    svg_response = client.post("/api/v1/reports/render.svg", json=render_payload)
    assert svg_response.status_code == 200
    assert svg_response.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in svg_response.text
    assert "Týden 1" in svg_response.text
    assert "25,4" in svg_response.text

    png_response = client.post("/api/v1/reports/render.png", json=render_payload)
    if png_response.status_code == 503:
        assert png_response.json()["code"] == "REPORT_PNG_RENDER_UNAVAILABLE"
        return
    assert png_response.status_code == 200
    assert png_response.headers["content-type"].startswith("image/png")
    assert png_response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert int.from_bytes(png_response.content[16:20], "big") == 1080
    assert int.from_bytes(png_response.content[20:24], "big") == 1920


def test_report_render_handles_non_finite_numeric_strings(client: TestClient) -> None:
    """Verify report rendering normalizes non-finite numeric strings."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/reports/render.svg",
        json={
            "values": {
                "title": "Non finite report",
                "completion_percent": "nan",
                "volume": {"planned": "inf", "actual": "-inf", "difference": "nan"},
            }
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "Non finite report" in response.text
    assert "nan" not in response.text.lower()
    assert "inf" not in response.text.lower()


def test_report_render_uses_template_theme_and_section_labels(client: TestClient) -> None:
    """Verify report rendering applies template visual metadata."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/reports/render.svg",
        json={
            "values": {"title": "Template themed report", "volume": {"planned": 10, "actual": 12}},
            "template": {
                "theme": {
                    "background": "#101820",
                    "background_end": "#182848",
                    "surface": "#223344",
                    "primary": "#00FF99",
                    "secondary": "#FF3366",
                    "text": "#F7F7F7",
                    "muted": "#D0D7E2",
                    "stroke": "#445566",
                },
                "sections": [
                    {"id": "volume", "label": "Weekly volume"},
                    {"id": "went_well", "label": "Highlights"},
                    {"id": "focus_next", "label": "Next targets"},
                ],
            },
        },
    )

    assert response.status_code == 200
    assert 'stop-color="#101820"' in response.text
    assert 'fill="#00FF99"' in response.text
    assert "Weekly volume" in response.text
    assert "Highlights" in response.text
    assert "Next targets" in response.text


def test_report_render_recomputes_volume_difference(client: TestClient) -> None:
    """Verify report rendering derives volume difference from edited values."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/reports/render.svg",
        json={
            "values": {
                "title": "Edited volume report",
                "volume": {"planned": 40, "actual": 30, "difference": 999},
            }
        },
    )

    assert response.status_code == 200
    assert "-10,0 km" in response.text
    assert "+999,0 km" not in response.text


def test_saved_report_api_is_owner_scoped(client: TestClient) -> None:
    """Verify saved report API creates owner reports and hides foreign reports."""
    from app.db.session import get_session_factory
    from app.models import GeneratedReport, User

    setup_and_login(client)
    with get_session_factory()() as session:
        other_user = User(email="other@example.com", timezone="Europe/Prague", units="metric")
        session.add(other_user)
        session.flush()
        foreign_report = GeneratedReport(
            user_id=other_user.id,
            title="Foreign Report",
            period_start=date(2026, 5, 18),
            period_end=date(2026, 5, 24),
            values={"title": "Foreign"},
        )
        session.add(foreign_report)
        session.commit()
        foreign_report_id = str(foreign_report.id)

    create_response = client.post("/api/v1/reports", json=_saved_report_payload("Owner Report"))
    assert create_response.status_code == 200
    assert create_response.json()["title"] == "Owner Report"

    list_response = client.get("/api/v1/reports")
    assert list_response.status_code == 200
    titles = {item["title"] for item in list_response.json()}
    assert "Owner Report" in titles
    assert "Foreign Report" not in titles

    foreign_response = client.get(f"/api/v1/reports/{foreign_report_id}")
    assert foreign_response.status_code == 404
    assert foreign_response.json()["code"] == "GENERATED_REPORT_NOT_FOUND"


def test_demo_user_cannot_mutate_report_templates_or_saved_reports(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify demo sessions cannot mutate report templates or saved reports."""
    _login_demo(client, monkeypatch)

    template_response = client.post("/api/v1/report-templates", json=_template_payload("Demo Story"))
    assert template_response.status_code == 403
    assert template_response.json()["code"] == "DEMO_READ_ONLY"

    report_response = client.post("/api/v1/reports", json=_saved_report_payload("Demo Report"))
    assert report_response.status_code == 403
    assert report_response.json()["code"] == "DEMO_READ_ONLY"


def _seed_report_builder_week(client: TestClient) -> None:
    """Seed one owner training week with unrelated foreign activity data."""
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, TrainingPlan, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        other_user = User(email="other@example.com", timezone="Europe/Prague", units="metric")
        plan = TrainingPlan(
            user_id=owner.id,
            title="Maratonská příprava",
            goal_type="marathon",
            start_date=date(2026, 5, 18),
            end_date=date(2026, 10, 4),
            status="active",
        )
        session.add_all([other_user, plan])
        session.flush()
        session.add_all(
            [
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 18),
                    workout_type="easy",
                    title="Lehký běh",
                    target_distance_m=Decimal("7000"),
                    target_duration_s=2700,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 20),
                    workout_type="tempo",
                    title="Tempo",
                    target_distance_m=Decimal("8000"),
                    target_duration_s=3000,
                    target_intensity="hard",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 21),
                    workout_type="easy",
                    title="Regenerace",
                    target_distance_m=Decimal("9000"),
                    target_duration_s=3600,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 22),
                    workout_type="rest",
                    title="Volno",
                    target_distance_m=None,
                    target_duration_s=None,
                    target_intensity="rest",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 23),
                    workout_type="easy",
                    title="Vytrvalost",
                    target_distance_m=Decimal("10000"),
                    target_duration_s=4200,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    plan_id=plan.id,
                    scheduled_date=date(2026, 5, 24),
                    workout_type="long_run",
                    title="Dlouhý běh",
                    target_distance_m=Decimal("12000"),
                    target_duration_s=5400,
                    target_intensity="easy",
                    status="planned",
                ),
            ]
        )
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="report-builder-owner-1",
                    sport_type="Run",
                    name="Lehký běh",
                    start_time_utc=datetime(2026, 5, 18, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("8000"),
                    moving_time_s=3600,
                    computed_load=Decimal("80"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="report-builder-owner-2",
                    sport_type="Run",
                    name="Běh do kopců",
                    start_time_utc=datetime(2026, 5, 20, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("8400"),
                    moving_time_s=3600,
                    computed_load=Decimal("90"),
                    intensity_class="moderate",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="report-builder-owner-3",
                    sport_type="Run",
                    name="Dlouhý běh",
                    start_time_utc=datetime(2026, 5, 24, 7, 0, tzinfo=UTC),
                    distance_m=Decimal("9000"),
                    moving_time_s=3976,
                    computed_load=Decimal("100"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=other_user.id,
                    provider="manual",
                    provider_activity_id="report-builder-other",
                    sport_type="Run",
                    name="Foreign run",
                    start_time_utc=datetime(2026, 5, 19, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("50000"),
                    moving_time_s=7200,
                    computed_load=Decimal("200"),
                    intensity_class="easy",
                ),
            ]
        )
        session.commit()


def _template_payload(name: str) -> dict[str, object]:
    """Return an API payload for a report template."""
    payload = _template_model_payload(name)
    return {
        "name": payload["name"],
        "description": payload["description"],
        "format": payload["format"],
        "theme": payload["theme"],
        "sections": payload["sections"],
        "field_defaults": payload["field_defaults"],
    }


def _template_model_payload(name: str) -> dict[str, object]:
    """Return model fields for a report template."""
    return {
        "name": name,
        "description": "Reusable Instagram story layout",
        "format": "instagram_story",
        "theme": {"background": "#0B1020", "accent": "#B7FF2A"},
        "sections": [{"id": "hero", "kind": "summary"}],
        "field_defaults": {"title": "Týdenní běžecký report", "main_unit": "km"},
        "is_default": False,
    }


def _saved_report_payload(title: str) -> dict[str, object]:
    """Return an API payload for a saved report."""
    return {
        "template_id": None,
        "title": title,
        "period_start": "2026-05-18",
        "period_end": "2026-05-24",
        "values": {
            "program": "MARATONSKÁ PŘÍPRAVA",
            "title": title,
            "week": "Týden 1",
            "main_distance": "25,4",
            "main_unit": "km",
        },
    }


def _login_demo(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Log the test client into an enabled demo account."""
    _enable_demo_account(monkeypatch)
    response = client.post("/api/v1/auth/demo-login")
    assert response.status_code == 200


def _enable_demo_account(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enable demo account settings for one test."""
    monkeypatch.setenv("DEMO_ACCOUNT_ENABLED", "true")
    monkeypatch.setenv("DEMO_ACCOUNT_EMAIL", "demo@example.com")
    monkeypatch.setenv("DEMO_ACCOUNT_PASSWORD", "demo password")
    monkeypatch.setenv("DEMO_ACCOUNT_DISPLAY_NAME", "Portfolio Demo")
    get_settings.cache_clear()
