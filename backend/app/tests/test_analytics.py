from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_training_load_prefers_hr_stream_when_zones_exist() -> None:
    """Verify HR stream load uses minutes in zone with configured weights."""
    from app.analytics.load import calculate_training_load

    result = calculate_training_load(
        moving_time_s=300,
        heartrate_stream=[110, 125, 145, 165, 185],
        hr_zones=[(0, 119), (120, 139), (140, 159), (160, 179), (180, 250)],
        rpe=None,
    )

    assert result.source == "hr_based"
    assert result.load == 19.0


def test_training_load_falls_back_to_rpe_then_duration() -> None:
    """Verify load falls back to RPE and then estimated duration."""
    from app.analytics.load import calculate_training_load

    rpe_result = calculate_training_load(
        moving_time_s=1800,
        heartrate_stream=None,
        hr_zones=None,
        rpe=6,
    )
    fallback_result = calculate_training_load(
        moving_time_s=1800,
        heartrate_stream=None,
        hr_zones=None,
        rpe=None,
    )

    assert rpe_result.source == "rpe_based"
    assert rpe_result.load == 180.0
    assert fallback_result.source == "duration_estimated"
    assert fallback_result.load == 60.0


def test_intensity_classification_uses_hr_then_rpe() -> None:
    """Verify intensity classification follows the documented V1 rules."""
    from app.analytics.intensity import classify_intensity

    easy = classify_intensity(
        moving_time_s=100,
        heartrate_stream=[110] * 80 + [150] * 20,
        hr_zones=[(0, 119), (120, 139), (140, 159), (160, 179), (180, 250)],
        rpe=None,
        workout_type=None,
    )
    hard = classify_intensity(
        moving_time_s=100,
        heartrate_stream=[110] * 80 + [170] * 20,
        hr_zones=[(0, 119), (120, 139), (140, 159), (160, 179), (180, 250)],
        rpe=None,
        workout_type=None,
    )
    rpe_moderate = classify_intensity(
        moving_time_s=100,
        heartrate_stream=None,
        hr_zones=None,
        rpe=5,
        workout_type=None,
    )

    assert easy == "easy"
    assert hard == "hard"
    assert rpe_moderate == "moderate"


def test_intensity_classification_keeps_borderline_z4_run_moderate() -> None:
    """Verify borderline Z4 time does not overstate a mostly Z3 run as hard."""
    from app.analytics.intensity import classify_intensity

    moderate = classify_intensity(
        moving_time_s=100,
        heartrate_stream=[132] * 3 + [141] * 18 + [152] * 63 + [166] * 16,
        hr_zones=[(90, 135), (136, 146), (147, 160), (161, 180), (181, 205)],
        rpe=None,
        workout_type=None,
    )

    assert moderate == "moderate"


def test_intensity_classification_treats_below_zone_hr_as_easy() -> None:
    """Verify low HR samples below the first zone are not counted as hard."""
    from app.analytics.intensity import classify_intensity

    easy = classify_intensity(
        moving_time_s=100,
        heartrate_stream=[80] * 75 + [130] * 25,
        hr_zones=[(90, 135), (136, 146), (147, 160), (161, 180), (181, 205)],
        rpe=None,
        workout_type=None,
    )

    assert easy == "easy"


def test_weekly_metrics_use_owner_timezone_for_week_boundaries(client) -> None:
    """Verify weekly metrics group activities by the owner local timezone."""
    from app.db.session import get_session_factory
    from app.models import Activity, User
    from app.services.analytics_service import recompute_owner_weekly_metrics

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="timezone-boundary",
                sport_type="Run",
                name="Sunday UTC Monday local",
                start_time_utc=datetime(2026, 4, 26, 22, 30, tzinfo=UTC),
                distance_m=Decimal("5000"),
                moving_time_s=1800,
                computed_load=Decimal("60"),
                intensity_class="easy",
            )
        )
        session.commit()

        metrics = recompute_owner_weekly_metrics(session, owner.id)

        assert [metric.week_start_date for metric in metrics] == [date(2026, 4, 27)]


def test_weekly_recompute_can_replace_existing_metrics(client) -> None:
    """Verify weekly recompute safely replaces existing aggregate rows."""
    from app.db.session import get_session_factory
    from app.models import Activity, User, WeeklyMetric
    from app.services.analytics_service import recompute_owner_weekly_metrics

    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="repeat-recompute",
                sport_type="Run",
                name="Repeat recompute run",
                start_time_utc=datetime(2026, 4, 28, 6, 0, tzinfo=UTC),
                distance_m=Decimal("7000"),
                moving_time_s=2500,
                computed_load=Decimal("83"),
                intensity_class="easy",
            )
        )
        session.commit()

        first = recompute_owner_weekly_metrics(session, owner.id)
        second = recompute_owner_weekly_metrics(session, owner.id)
        stored = session.scalars(select(WeeklyMetric).where(WeeklyMetric.user_id == owner.id)).all()

        assert len(first) == 1
        assert len(second) == 1
        assert len(stored) == 1
    assert float(stored[0].distance_m) == 7000.0


def test_heatmap_endpoint_aggregates_owner_gps_streams(client) -> None:
    """Verify heatmap analytics aggregate repeated route coordinates."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        run = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="heatmap-run",
            sport_type="Run",
            name="Park loops",
            start_time_utc=datetime(2026, 4, 28, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            computed_load=Decimal("70"),
            intensity_class="easy",
        )
        ignored = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="heatmap-ride",
            sport_type="Ride",
            name="Bike commute",
            start_time_utc=datetime(2026, 4, 28, 7, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1200,
            computed_load=Decimal("40"),
            intensity_class="easy",
        )
        session.add_all([run, ignored])
        session.flush()
        session.add_all(
            [
                ActivityStream(
                    activity_id=run.id,
                    stream_type="latlng",
                    data=[[50.0001, 14.0001], [50.0002, 14.0002], [50.0012, 14.0012]],
                    sample_count=3,
                ),
                ActivityStream(
                    activity_id=ignored.id,
                    stream_type="latlng",
                    data=[[51.0001, 15.0001]],
                    sample_count=1,
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/heatmap?precision=3")

    assert response.status_code == 200
    body = response.json()
    assert body["activity_count"] == 1
    assert body["point_count"] == 3
    assert body["bounds"] == {"south": 50.0, "west": 14.0, "north": 50.001, "east": 14.001}
    assert body["points"] == [
        {"lat": 50.0, "lng": 14.0, "weight": 2, "activity_count": 1},
        {"lat": 50.001, "lng": 14.001, "weight": 1, "activity_count": 1},
    ]


def test_dashboard_returns_current_week_plan_comparison(client, monkeypatch) -> None:
    """Verify dashboard shows current week planned versus completed training."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add_all(
            [
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 27),
                    workout_type="easy",
                    title="Easy run",
                    target_distance_m=Decimal("5000"),
                    target_duration_s=1800,
                    target_intensity="easy",
                    status="planned",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 30),
                    workout_type="tempo",
                    title="Tempo run",
                    target_distance_m=Decimal("8000"),
                    target_duration_s=3000,
                    target_intensity="hard",
                    status="planned",
                ),
            ]
        )
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="planned-but-different",
                    sport_type="Run",
                    name="Actual easy day",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("6000"),
                    moving_time_s=2100,
                    computed_load=Decimal("90"),
                    intensity_class="moderate",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="extra-run",
                    sport_type="Run",
                    name="Extra Wednesday",
                    start_time_utc=datetime(2026, 4, 29, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("4000"),
                    moving_time_s=1500,
                    computed_load=Decimal("50"),
                    intensity_class="easy",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard")

    assert response.status_code == 200
    week_plan = response.json()["week_plan"]
    assert week_plan["week_start_date"] == "2026-04-27"
    assert week_plan["planned_distance_m"] == 13000
    assert week_plan["completed_distance_m"] == 10000
    assert week_plan["remaining_distance_m"] == 8000
    assert week_plan["extra_sessions"] == 1
    assert {row["outcome"] for row in week_plan["rows"]} == {"different_intensity", "extra", "waiting"}


def test_dashboard_accepts_selected_week_for_plan_comparison(client, monkeypatch) -> None:
    """Verify dashboard can show planned-versus-completed data for another week."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add(
            PlannedWorkout(
                user_id=owner.id,
                scheduled_date=date(2026, 4, 21),
                workout_type="easy",
                title="Previous week easy",
                target_distance_m=Decimal("5000"),
                target_duration_s=1800,
                target_intensity="easy",
                status="planned",
            )
        )
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="previous-week-run",
                sport_type="Run",
                name="Previous week run",
                start_time_utc=datetime(2026, 4, 21, 6, 0, tzinfo=UTC),
                distance_m=Decimal("5200"),
                moving_time_s=1850,
                computed_load=Decimal("62"),
                intensity_class="easy",
            )
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard?week_start_date=2026-04-20")

    assert response.status_code == 200
    week_plan = response.json()["week_plan"]
    assert week_plan["week_start_date"] == "2026-04-20"
    assert week_plan["week_end_date"] == "2026-04-26"
    assert week_plan["planned_distance_m"] == 5000
    assert week_plan["completed_distance_m"] == 5200
    assert {row["outcome"] for row in week_plan["rows"]} == {"as_planned"}


def test_dashboard_deduplicates_same_day_planned_workouts(client, monkeypatch) -> None:
    """Verify dashboard treats duplicate planned workouts on one day as one plan item."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 5, 21, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add_all(
            [
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 18),
                    workout_type="easy",
                    title="Old duplicate",
                    target_distance_m=Decimal("5000"),
                    target_duration_s=1800,
                    target_intensity="easy",
                    status="planned",
                    created_at=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
                    updated_at=datetime(2026, 5, 1, 10, 0, tzinfo=UTC),
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 18),
                    workout_type="easy",
                    title="Easy run",
                    target_distance_m=Decimal("7000"),
                    target_duration_s=2700,
                    target_intensity="easy",
                    status="planned",
                    created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
                    updated_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="same-day-run",
                    sport_type="Run",
                    name="Afternoon Run",
                    start_time_utc=datetime(2026, 5, 18, 15, 55, 54, tzinfo=UTC),
                    distance_m=Decimal("6297.40"),
                    moving_time_s=2644,
                    computed_load=Decimal("60"),
                    intensity_class="easy",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard?week_start_date=2026-05-18")

    assert response.status_code == 200
    week_plan = response.json()["week_plan"]
    day_rows = [row for row in week_plan["rows"] if row["date"] == "2026-05-18"]
    assert len(day_rows) == 1
    assert day_rows[0]["planned_title"] == "Easy run"
    assert day_rows[0]["activity_name"] == "Afternoon Run"
    assert week_plan["planned_sessions"] == 1
    assert week_plan["completed_sessions"] == 1
    assert week_plan["extra_sessions"] == 0
    assert week_plan["planned_distance_m"] == 7000
    assert week_plan["planned_time_s"] == 2700


def test_dashboard_matches_multiple_same_day_planned_sessions_in_order(client, monkeypatch) -> None:
    """Verify dashboard compares each same-day planned session with one activity."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 5, 18, 21, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add_all(
            [
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 18),
                    session_label="Ráno",
                    sort_order=0,
                    workout_type="tempo",
                    title="Threshold intervaly",
                    target_duration_s=2700,
                    target_intensity="hard",
                    status="planned",
                    created_at=datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
                    updated_at=datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 5, 18),
                    session_label="Odpoledne",
                    sort_order=1,
                    workout_type="tempo",
                    title="Threshold tempo",
                    target_duration_s=2700,
                    target_intensity="hard",
                    status="planned",
                    created_at=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                    updated_at=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="morning-threshold",
                    sport_type="Run",
                    name="Morning threshold",
                    start_time_utc=datetime(2026, 5, 18, 6, 0, tzinfo=UTC),
                    moving_time_s=2700,
                    computed_load=Decimal("140"),
                    intensity_class="hard",
                ),
                Activity(
                    user_id=owner.id,
                    provider="strava",
                    provider_activity_id="afternoon-threshold",
                    sport_type="Run",
                    name="Afternoon threshold",
                    start_time_utc=datetime(2026, 5, 18, 15, 0, tzinfo=UTC),
                    moving_time_s=2700,
                    computed_load=Decimal("140"),
                    intensity_class="hard",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard?week_start_date=2026-05-18")

    assert response.status_code == 200
    week_plan = response.json()["week_plan"]
    assert week_plan["planned_sessions"] == 2
    assert week_plan["extra_sessions"] == 0
    day_rows = [row for row in week_plan["rows"] if row["date"] == "2026-05-18"]
    assert [(row["planned_title"], row["activity_name"], row["outcome"]) for row in day_rows] == [
        ("Threshold intervaly", "Morning threshold", "as_planned"),
        ("Threshold tempo", "Afternoon threshold", "as_planned"),
    ]


def test_dashboard_weekly_series_uses_dense_recent_weeks(client, monkeypatch) -> None:
    """Verify dashboard weekly chart data keeps the recent window even with gaps."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="very-old",
                    sport_type="Run",
                    name="Old run",
                    start_time_utc=datetime(2024, 7, 8, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1800,
                    computed_load=Decimal("60"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="current-week",
                    sport_type="Run",
                    name="Current run",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("6000"),
                    moving_time_s=2100,
                    computed_load=Decimal("70"),
                    intensity_class="moderate",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard")

    assert response.status_code == 200
    weekly = response.json()["weekly"]
    assert len(weekly) == 12
    assert weekly[0]["week_start_date"] == "2026-02-09"
    assert weekly[-1]["week_start_date"] == "2026-04-27"
    assert all(not item["week_start_date"].startswith("2024") for item in weekly)
    assert weekly[-1]["distance_m"] == 6000
    assert weekly[-1]["moderate_time_s"] == 2100


def test_recent_weeks_endpoint_returns_dense_intensity_window(client, monkeypatch) -> None:
    """Verify recent weekly analytics includes empty weeks and intensity totals."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="easy-recent",
                    sport_type="Run",
                    name="Easy recent",
                    start_time_utc=datetime(2026, 4, 14, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("7000"),
                    moving_time_s=2400,
                    computed_load=Decimal("80"),
                    intensity_class="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="hard-current",
                    sport_type="Run",
                    name="Hard current",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("9000"),
                    moving_time_s=3000,
                    computed_load=Decimal("150"),
                    intensity_class="hard",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/recent-weeks?weeks=4")

    assert response.status_code == 200
    weekly = response.json()
    assert [item["week_start_date"] for item in weekly] == [
        "2026-04-06",
        "2026-04-13",
        "2026-04-20",
        "2026-04-27",
    ]
    assert weekly[1]["distance_m"] == 7000
    assert weekly[1]["easy_time_s"] == 2400
    assert weekly[2]["distance_m"] == 0
    assert weekly[3]["hard_time_s"] == 3000


def test_recent_weeks_read_reuses_current_weekly_metrics(client, monkeypatch) -> None:
    """Verify repeated weekly reads do not rebuild current aggregate rows."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, User, WeeklyMetric

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            Activity(
                user_id=owner.id,
                provider="manual",
                provider_activity_id="cached-week",
                sport_type="Run",
                name="Cached weekly run",
                start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                distance_m=Decimal("9000"),
                moving_time_s=3000,
                computed_load=Decimal("100"),
                intensity_class="easy",
            )
        )
        session.commit()

    first_response = client.get("/api/v1/analytics/recent-weeks?weeks=4")
    assert first_response.status_code == 200
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        first_ids = [
            metric.id
            for metric in session.scalars(
                select(WeeklyMetric).where(WeeklyMetric.user_id == owner.id).order_by(WeeklyMetric.week_start_date)
            )
        ]

    second_response = client.get("/api/v1/analytics/recent-weeks?weeks=4")
    assert second_response.status_code == 200
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        second_ids = [
            metric.id
            for metric in session.scalars(
                select(WeeklyMetric).where(WeeklyMetric.user_id == owner.id).order_by(WeeklyMetric.week_start_date)
            )
        ]

    assert second_ids == first_ids


def test_yearly_summary_uses_full_owner_local_calendar_year(client) -> None:
    """Verify yearly summary uses the owner's full local calendar year."""
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        owner.timezone = "Europe/Prague"
        other = User(email="other@example.com", timezone="Europe/Prague")
        session.add(other)
        session.flush()
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="local-2025-before-year",
                    sport_type="Run",
                    name="Still local 2025",
                    start_time_utc=datetime(2025, 12, 31, 22, 30, tzinfo=UTC),
                    distance_m=Decimal("4000"),
                    moving_time_s=1200,
                    elevation_gain_m=Decimal("40"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="local-2026-start",
                    sport_type="Run",
                    name="Local year start",
                    start_time_utc=datetime(2025, 12, 31, 23, 30, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1500,
                    elevation_gain_m=Decimal("50"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="local-2026-end",
                    sport_type="TrailRun",
                    name="Local year end",
                    start_time_utc=datetime(2026, 12, 31, 22, 30, tzinfo=UTC),
                    distance_m=Decimal("7000"),
                    moving_time_s=2100,
                    elevation_gain_m=Decimal("170"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="local-2027-after-year",
                    sport_type="Run",
                    name="Already local 2027",
                    start_time_utc=datetime(2026, 12, 31, 23, 30, tzinfo=UTC),
                    distance_m=Decimal("9000"),
                    moving_time_s=2700,
                    elevation_gain_m=Decimal("90"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="yearly-ride",
                    sport_type="Ride",
                    name="Ignored ride",
                    start_time_utc=datetime(2026, 6, 1, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("10000"),
                    moving_time_s=1800,
                    elevation_gain_m=Decimal("100"),
                ),
                Activity(
                    user_id=other.id,
                    provider="manual",
                    provider_activity_id="other-owner-yearly-run",
                    sport_type="Run",
                    name="Other owner run",
                    start_time_utc=datetime(2026, 6, 1, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("3000"),
                    moving_time_s=900,
                    elevation_gain_m=Decimal("30"),
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/yearly-summary?year=2026")

    assert response.status_code == 200
    assert response.json() == {
        "year": 2026,
        "distance_m": 12000.0,
        "elevation_gain_m": 220.0,
        "moving_time_s": 3600,
    }


def test_recent_weeks_split_hr_activity_by_zone_breakdown(client, monkeypatch) -> None:
    """Verify weekly intensity split uses HR zone time when stream data exists."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Current zones",
                effective_from=date(2026, 1, 1),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
            )
        )
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="weekly-zone-breakdown",
            sport_type="Run",
            name="Hard label mixed zones",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("9000"),
            moving_time_s=500,
            computed_load=Decimal("150"),
            intensity_class="hard",
        )
        session.add(activity)
        session.flush()
        session.add(
            ActivityStream(
                activity_id=activity.id,
                stream_type="heartrate",
                data=[100, 130, 150, 170, 190],
                sample_count=5,
            )
        )
        session.commit()

    response = client.get("/api/v1/analytics/recent-weeks?weeks=1")

    assert response.status_code == 200
    week = response.json()[0]
    assert week["moving_time_s"] == 500
    assert week["easy_time_s"] == 200
    assert week["moderate_time_s"] == 100
    assert week["hard_time_s"] == 200
    assert week["unknown_time_s"] == 0


def test_trend_metrics_expose_zone_pace_consistency_plan_and_monotony(client, monkeypatch) -> None:
    """Verify trend metrics combine HR zones, pace, plans, consistency, and load shape."""
    import app.services.analytics_service as analytics_service
    import app.services.trend_metrics_service as trend_metrics_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    monkeypatch.setattr(trend_metrics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Current zones",
                effective_from=date(2026, 1, 1),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
            )
        )
        hr_activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="trend-hr-run",
            sport_type="Run",
            name="Mixed HR run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("2000"),
            moving_time_s=600,
            elevation_gain_m=Decimal("100"),
            computed_load=Decimal("80"),
            intensity_class="moderate",
        )
        easy_activity = Activity(
            user_id=owner.id,
            provider="manual",
            provider_activity_id="trend-easy-run",
            sport_type="Run",
            name="Easy fallback run",
            start_time_utc=datetime(2026, 4, 29, 6, 0, tzinfo=UTC),
            distance_m=Decimal("3000"),
            moving_time_s=900,
            elevation_gain_m=Decimal("0"),
            computed_load=Decimal("30"),
            intensity_class="easy",
        )
        session.add_all([hr_activity, easy_activity])
        session.flush()
        session.add_all(
            [
                ActivityStream(activity_id=hr_activity.id, stream_type="time", data=[0, 200, 400, 600], sample_count=4),
                ActivityStream(activity_id=hr_activity.id, stream_type="distance", data=[0, 600, 1300, 2000], sample_count=4),
                ActivityStream(activity_id=hr_activity.id, stream_type="heartrate", data=[100, 130, 150, 170], sample_count=4),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 27),
                    workout_type="run",
                    title="Planned moderate run",
                    target_duration_s=1800,
                    target_distance_m=Decimal("6000"),
                    target_intensity="moderate",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/trend-metrics?weeks=1")

    assert response.status_code == 200
    week = response.json()[0]
    assert week["week_start_date"] == "2026-04-27"
    assert week["zone_seconds"] == [150, 150, 150, 150, 0]
    assert week["easy_pace_s_per_km"] == 300
    assert week["long_run_share"] == 60
    assert week["run_day_count"] == 2
    assert week["elevation_gain_per_km"] == 20
    assert week["zone_paces_s_per_km"][1] == 333.3
    assert week["zone_paces_s_per_km"][2] == 285.7
    assert week["planned_distance_m"] == 6000
    assert week["completed_distance_m"] == 5000
    assert week["distance_adherence"] == 83.3
    assert week["time_adherence"] == 83.3
    assert week["load_adherence"] == 91.7
    assert week["monotony"] > 0


def test_trend_metrics_expose_coach_effect_insight(client, monkeypatch) -> None:
    """Verify trend metrics explain plan intent, stimulus, response, and next step."""
    import app.services.analytics_service as analytics_service
    import app.services.trend_metrics_service as trend_metrics_service
    from app.db.session import get_session_factory
    from app.models import Activity, PlannedWorkout, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    monkeypatch.setattr(trend_metrics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="previous-easy",
                    sport_type="Run",
                    name="Previous easy",
                    start_time_utc=datetime(2026, 4, 20, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1800,
                    elevation_gain_m=Decimal("0"),
                    computed_load=Decimal("60"),
                    intensity_class="easy",
                ),
                PlannedWorkout(
                    user_id=owner.id,
                    scheduled_date=date(2026, 4, 27),
                    workout_type="easy",
                    title="Aerobic check",
                    target_duration_s=1980,
                    target_distance_m=Decimal("6000"),
                    target_intensity="easy",
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="current-easy",
                    sport_type="Run",
                    name="Current easy",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("6000"),
                    moving_time_s=1980,
                    elevation_gain_m=Decimal("0"),
                    computed_load=Decimal("66"),
                    intensity_class="easy",
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/trend-metrics?weeks=2")

    assert response.status_code == 200
    current_week = response.json()[-1]
    assert current_week["coach_intent"] == "base"
    assert current_week["coach_stimulus"] == "on_target"
    assert current_week["coach_response"] == "positive"
    assert current_week["coach_recommendation"] == "keep_plan"


def test_trend_metrics_ignore_implausible_zone_pace_stream_segments(client, monkeypatch) -> None:
    """Verify zone pace ignores GPS distance spikes and pause artifacts."""
    import app.services.analytics_service as analytics_service
    import app.services.trend_metrics_service as trend_metrics_service
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    monkeypatch.setattr(trend_metrics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            HeartRateZoneSet(
                user_id=owner.id,
                name="Current zones",
                effective_from=date(2026, 1, 1),
                zones=[
                    {"name": "Z1", "min_hr": 90, "max_hr": 120},
                    {"name": "Z2", "min_hr": 121, "max_hr": 140},
                    {"name": "Z3", "min_hr": 141, "max_hr": 160},
                    {"name": "Z4", "min_hr": 161, "max_hr": 180},
                    {"name": "Z5", "min_hr": 181, "max_hr": 205},
                ],
            )
        )
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="trend-pace-outlier",
            sport_type="Run",
            name="Outlier stream run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("2100"),
            moving_time_s=4201,
            elevation_gain_m=Decimal("0"),
            computed_load=Decimal("50"),
            intensity_class="moderate",
        )
        session.add(activity)
        session.flush()
        session.add_all(
            [
                ActivityStream(activity_id=activity.id, stream_type="time", data=[0, 1, 301, 601, 4201], sample_count=5),
                ActivityStream(activity_id=activity.id, stream_type="distance", data=[0, 100, 1100, 2100, 2110], sample_count=5),
                ActivityStream(activity_id=activity.id, stream_type="heartrate", data=[100, 140, 140, 150, 150], sample_count=5),
            ]
        )
        session.commit()

    response = client.get("/api/v1/analytics/trend-metrics?weeks=1")

    assert response.status_code == 200
    week = response.json()[0]
    assert week["zone_paces_s_per_km"][1] == 300
    assert week["zone_paces_s_per_km"][2] == 300


def test_dashboard_exposes_unknown_intensity_time(client, monkeypatch) -> None:
    """Verify dashboard includes unclassified running time in intensity data."""
    import app.services.analytics_service as analytics_service
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    monkeypatch.setattr(analytics_service, "utc_now", lambda: datetime(2026, 4, 29, 10, 0, tzinfo=UTC))
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add(
            Activity(
                user_id=owner.id,
                provider="strava",
                provider_activity_id="unknown-intensity",
                sport_type="Run",
                name="Run without zones",
                start_time_utc=datetime(2026, 4, 28, 6, 0, tzinfo=UTC),
                distance_m=Decimal("5000"),
                moving_time_s=1800,
                computed_load=Decimal("60"),
                intensity_class="unknown",
            )
        )
        session.commit()

    response = client.get("/api/v1/analytics/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["intensity_split"]["unknown_time_s"] == 1800
    assert body["weekly"][-1]["unknown_time_s"] == 1800
