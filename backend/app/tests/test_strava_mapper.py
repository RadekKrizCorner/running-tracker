from __future__ import annotations


def test_strava_mapper_normalizes_running_activity() -> None:
    """Verify Strava payloads map to local activity fields."""
    from app.providers.strava.mapper import is_running_activity, map_strava_activity

    payload = {
        "id": 12345,
        "sport_type": "Run",
        "type": "Run",
        "name": "Morning Run",
        "start_date": "2026-04-20T06:15:00Z",
        "start_date_local": "2026-04-20T08:15:00Z",
        "timezone": "(GMT+01:00) Europe/Prague",
        "distance": 6400.5,
        "moving_time": 1900,
        "elapsed_time": 2000,
        "total_elevation_gain": 85.0,
        "average_speed": 3.37,
        "max_speed": 5.1,
        "average_heartrate": 142.0,
        "max_heartrate": 175.0,
        "average_cadence": 82.0,
        "calories": 480.0,
        "map": {"summary_polyline": "encoded"},
    }

    mapped = map_strava_activity(payload)

    assert is_running_activity(payload)
    assert mapped["provider"] == "strava"
    assert mapped["provider_activity_id"] == "12345"
    assert mapped["sport_type"] == "Run"
    assert mapped["name"] == "Morning Run"
    assert mapped["distance_m"] == 6400.5
    assert mapped["moving_time_s"] == 1900
    assert mapped["map_polyline"] == "encoded"
    assert mapped["source_payload"] == payload


def test_strava_mapper_excludes_non_running_activity() -> None:
    """Verify non-running Strava activities are not treated as V1 runs."""
    from app.providers.strava.mapper import is_running_activity

    assert not is_running_activity({"sport_type": "Ride", "type": "Ride"})

