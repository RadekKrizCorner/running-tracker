from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select

from app.tests.conftest import setup_and_login


def test_activity_list_searches_names_with_owner_scope(client) -> None:
    """Verify activity search filters names without leaking another owner."""
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        other_user = User(email="other@example.com", timezone="Europe/Prague", units="metric")
        session.add(other_user)
        session.flush()
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="owner-hill",
                    sport_type="Run",
                    name="Hill repeats",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1800,
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="owner-flat",
                    sport_type="Run",
                    name="Flat recovery",
                    start_time_utc=datetime(2026, 4, 28, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("6000"),
                    moving_time_s=2100,
                ),
                Activity(
                    user_id=other_user.id,
                    provider="manual",
                    provider_activity_id="other-hill",
                    sport_type="Run",
                    name="Other hill run",
                    start_time_utc=datetime(2026, 4, 29, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("7000"),
                    moving_time_s=2400,
                ),
            ]
        )
        session.commit()

    response = client.get("/api/v1/activities?search=hill")

    assert response.status_code == 200
    assert [activity["name"] for activity in response.json()] == ["Hill repeats"]


def test_activity_list_sorts_by_training_metrics(client) -> None:
    """Verify activity list supports metric sort keys used by the UI."""
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        session.add_all(
            [
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="short-fast",
                    sport_type="Run",
                    name="Short fast",
                    start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("5000"),
                    moving_time_s=1500,
                    elevation_gain_m=Decimal("120"),
                    average_hr=Decimal("152"),
                    computed_load=Decimal("45"),
                ),
                Activity(
                    user_id=owner.id,
                    provider="manual",
                    provider_activity_id="long-steady",
                    sport_type="Run",
                    name="Long steady",
                    start_time_utc=datetime(2026, 4, 28, 6, 0, tzinfo=UTC),
                    distance_m=Decimal("10000"),
                    moving_time_s=3900,
                    elevation_gain_m=Decimal("80"),
                    average_hr=Decimal("142"),
                    computed_load=Decimal("85"),
                ),
            ]
        )
        session.commit()

    expectations = {
        "-distance": ["Long steady", "Short fast"],
        "moving_time": ["Short fast", "Long steady"],
        "pace": ["Short fast", "Long steady"],
        "-average_hr": ["Short fast", "Long steady"],
        "-computed_load": ["Long steady", "Short fast"],
        "-elevation_gain": ["Short fast", "Long steady"],
    }
    for sort, expected_names in expectations.items():
        response = client.get(f"/api/v1/activities?sort={sort}")

        assert response.status_code == 200
        assert [activity["name"] for activity in response.json()] == expected_names


def test_partial_note_update_preserves_existing_wellness_fields(client) -> None:
    """Verify note-only saves do not wipe existing wellness values."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityNote, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        activity = Activity(
            user_id=owner.id,
            provider="manual",
            provider_activity_id="note-preserve",
            sport_type="Run",
            name="Notes run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
        )
        session.add(activity)
        session.flush()
        session.add(
            ActivityNote(
                activity_id=activity.id,
                user_id=owner.id,
                rpe=7,
                fatigue=4,
                soreness=3,
                pain_flag=True,
                pain_location="left calf",
                sleep_quality=2,
                notes="Original note",
            )
        )
        session.commit()
        activity_id = activity.id

    response = client.put(f"/api/v1/activities/{activity_id}/notes", json={"notes": "Updated note"})

    assert response.status_code == 200
    assert response.json() == {
        "rpe": 7,
        "fatigue": 4,
        "soreness": 3,
        "pain_flag": True,
        "pain_location": "left calf",
        "sleep_quality": 2,
        "notes": "Updated note",
    }


def test_activity_patch_preserves_hr_based_metrics(client) -> None:
    """Verify editing metadata keeps HR-zone-derived load and intensity."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User
    from app.services.profile_service import recompute_activity_metrics

    setup_and_login(client)
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
            provider_activity_id="hr-preserve",
            sport_type="Run",
            name="HR run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=600,
            computed_load=Decimal("20"),
            load_source="duration_estimated",
            intensity_class="unknown",
        )
        session.add(activity)
        session.flush()
        session.add(
            ActivityStream(
                activity_id=activity.id,
                stream_type="heartrate",
                data=[165, 166, 167, 168, 169],
                sample_count=5,
            )
        )
        session.commit()
        recompute_activity_metrics(session, activity)
        activity_id = activity.id
        expected_load = float(activity.computed_load or 0)

    response = client.patch(f"/api/v1/activities/{activity_id}", json={"description": "Edited after import"})

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Edited after import"
    assert body["load_source"] == "hr_based"
    assert body["computed_load"] == expected_load
    assert body["intensity_class"] == "hard"


def test_activity_detail_includes_heart_rate_zone_breakdown(client) -> None:
    """Verify activity detail shows time spent in each effective heart-rate zone."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, HeartRateZoneSet, User

    setup_and_login(client)
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
            provider_activity_id="hr-zone-breakdown",
            sport_type="Run",
            name="Zone detail run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=600,
            computed_load=Decimal("20"),
            load_source="hr_based",
            intensity_class="moderate",
        )
        session.add(activity)
        session.flush()
        session.add(
            ActivityStream(
                activity_id=activity.id,
                stream_type="heartrate",
                data=[100, 130, 145, 165, 190],
                sample_count=5,
            )
        )
        session.commit()
        activity_id = activity.id

    response = client.get(f"/api/v1/activities/{activity_id}")

    assert response.status_code == 200
    breakdown = response.json()["heart_rate_zone_breakdown"]
    assert [zone["name"] for zone in breakdown] == ["Z1", "Z2", "Z3", "Z4", "Z5"]
    assert [zone["seconds"] for zone in breakdown] == [120, 120, 120, 120, 120]
    assert [zone["sample_count"] for zone in breakdown] == [1, 1, 1, 1, 1]
    assert [zone["percentage"] for zone in breakdown] == [20, 20, 20, 20, 20]


def test_activity_splits_use_distance_time_hr_and_elevation_streams(client) -> None:
    """Verify activity splits are calculated from imported stream samples."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="split-streams",
            sport_type="Run",
            name="Split run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("2100"),
            moving_time_s=750,
            elevation_gain_m=Decimal("18"),
        )
        session.add(activity)
        session.flush()
        session.add_all(
            [
                ActivityStream(activity_id=activity.id, stream_type="distance", data=[0, 1000, 2000, 2100], sample_count=4),
                ActivityStream(activity_id=activity.id, stream_type="time", data=[0, 360, 720, 750], sample_count=4),
                ActivityStream(activity_id=activity.id, stream_type="heartrate", data=[130, 140, 150, 151], sample_count=4),
                ActivityStream(activity_id=activity.id, stream_type="altitude", data=[250, 258, 264, 266], sample_count=4),
            ]
        )
        session.commit()
        activity_id = activity.id

    response = client.get(f"/api/v1/activities/{activity_id}/splits")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "streams"
    assert [split["split_index"] for split in body["splits"]] == [1, 2, 3]
    assert body["splits"][0]["distance_m"] == 1000
    assert body["splits"][0]["duration_s"] == 360
    assert body["splits"][0]["average_hr"] == 135
    assert body["splits"][1]["elevation_gain_m"] == 6
    assert body["splits"][2]["distance_m"] == 100


def test_activity_splits_distribute_sparse_corrected_elevation_stream(client) -> None:
    """Verify sparse corrected elevation is distributed across distance splits."""
    from app.db.session import get_session_factory
    from app.models import Activity, ActivityStream, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        activity = Activity(
            user_id=owner.id,
            provider="strava",
            provider_activity_id="split-corrected-elevation",
            sport_type="Run",
            name="Corrected elevation split run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("3000"),
            moving_time_s=900,
            elevation_gain_m=Decimal("30"),
        )
        session.add(activity)
        session.flush()
        session.add_all(
            [
                ActivityStream(activity_id=activity.id, stream_type="distance", data=[0, 1000, 2000, 3000], sample_count=4),
                ActivityStream(activity_id=activity.id, stream_type="time", data=[0, 300, 600, 900], sample_count=4),
                ActivityStream(activity_id=activity.id, stream_type="elevation_corrected", data=[100, 130], sample_count=2),
            ]
        )
        session.commit()
        activity_id = activity.id

    response = client.get(f"/api/v1/activities/{activity_id}/splits")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "streams"
    assert [split["elevation_gain_m"] for split in body["splits"]] == [10, 10, 10]


def test_activity_splits_fallback_to_whole_activity_when_streams_missing(client) -> None:
    """Verify split endpoint still gives useful output without streams."""
    from app.db.session import get_session_factory
    from app.models import Activity, User

    setup_and_login(client)
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        activity = Activity(
            user_id=owner.id,
            provider="manual",
            provider_activity_id="split-fallback",
            sport_type="Run",
            name="Manual split run",
            start_time_utc=datetime(2026, 4, 27, 6, 0, tzinfo=UTC),
            distance_m=Decimal("5000"),
            moving_time_s=1800,
            average_hr=Decimal("142"),
            elevation_gain_m=Decimal("35"),
        )
        session.add(activity)
        session.commit()
        activity_id = activity.id

    response = client.get(f"/api/v1/activities/{activity_id}/splits")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "activity_summary"
    assert body["splits"] == [
        {
            "split_index": 1,
            "distance_m": 5000.0,
            "duration_s": 1800,
            "pace_s_per_km": 360.0,
            "average_hr": 142.0,
            "elevation_gain_m": 35.0,
        }
    ]
