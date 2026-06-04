from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_weekly_report_summary_uses_owner_plan_and_activities(client) -> None:
    """Verify weekly report data uses owner plan and activity totals."""
    from app.db.session import get_session_factory
    from app.models import User
    from app.services.weekly_report_service import build_weekly_report

    _seed_weekly_report_data(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None

        report = build_weekly_report(session, owner, date(2026, 5, 18))

    assert report.plan_title == "Maratonská příprava"
    assert report.week_label == "Týden 1"
    assert report.total_distance_label == "25,4 km"
    assert report.plan_actual_label == "46,0/25,4"
    assert report.completion_label == "55%"
    assert report.session_adherence_label == "3/5"
    assert report.longest_run_label == "9,0 km"
    assert report.average_pace_label == '7:20"/km'
    assert report.volume_delta_label == "-20,6 km"


def test_weekly_report_svg_uses_compact_social_layout() -> None:
    """Verify the SVG report uses compact social-share copy and icon layout."""
    from app.services.weekly_report_service import WeeklyReport, render_weekly_report_svg

    report = WeeklyReport(
        plan_title="WEEK OF 18. 5.",
        week_label="Týden 1",
        total_distance_label="54,0 km",
        completed_runs_label="5",
        total_time_label="6 h 12 min",
        plan_actual_label="50,0/54,0",
        longest_run_label="18,0 km",
        average_pace_label='6:54"/km',
        session_adherence_label="5/5",
        completion_label="108%",
        volume_delta_label="+4,0 km",
        planned_distance_label="50,0 km",
        completed_distance_label="54,0 km",
        summary_text="Silný týden s velmi dobrým plněním plánu.",
        win_lines=("pravidelný pohyb a dobrý základ týdne", "nejdelší běh dobře podpořil vytrvalost"),
        planned_distance_m=50000,
        completed_distance_m=54000,
        completion_ratio=1.08,
    )

    svg = render_weekly_report_svg(report)

    assert "WEEK OF" not in svg
    assert ">Týdenní běžecký report</text>" in svg
    assert "Týdenní běžecký</text><text" not in svg
    assert "Silný týden s velmi dobrým plněním plánu." not in svg
    assert "Silný týden s velmi dobrým" in svg
    assert "plněním plánu." in svg
    assert 'class="font progressMetric">108%</text>' in svg
    assert 'id="route-map-pin-icon"' in svg
    assert "M36 126c18-31 45-11 65-38" in svg
    assert 'id="running-shoe-icon"' not in svg


def test_weekly_report_svg_endpoint_returns_authenticated_owner_report(client) -> None:
    """Verify SVG endpoint returns the authenticated owner weekly report."""
    _seed_weekly_report_data(client)

    response = client.get("/api/v1/analytics/weekly-report.svg?week_start_date=2026-05-18")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "weekly-report-2026-05-18.svg" in response.headers["content-disposition"]
    assert "<svg" in response.text
    assert "Týden 1" in response.text
    assert "25,4 km" in response.text
    assert "55%" in response.text
    assert "46,0/25,4" in response.text
    assert "3/5" in response.text
    assert "50,0 km" not in response.text


def test_weekly_report_png_endpoint_returns_social_image(client) -> None:
    """Verify PNG endpoint rasterizes the weekly report for social sharing."""
    _seed_weekly_report_data(client)

    response = client.get("/api/v1/analytics/weekly-report.png?week_start_date=2026-05-18")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert "weekly-report-2026-05-18.png" in response.headers["content-disposition"]
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.content) > 1000
    assert int.from_bytes(response.content[16:20], "big") == 1080
    assert int.from_bytes(response.content[20:24], "big") == 1920


def _seed_weekly_report_data(client) -> None:
    """Seed one marathon plan week with owner and unrelated user data."""
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
                    provider_activity_id="report-owner-1",
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
                    provider_activity_id="report-owner-2",
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
                    provider_activity_id="report-owner-3",
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
                    provider_activity_id="report-other-user",
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
