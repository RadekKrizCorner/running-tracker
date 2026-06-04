from __future__ import annotations

from datetime import datetime

from app.core.time import parse_datetime

RUNNING_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill", "TreadmillRun"}
STREAM_TYPES = {
    "time",
    "distance",
    "latlng",
    "altitude",
    "velocity_smooth",
    "heartrate",
    "cadence",
    "moving",
    "grade_smooth",
}


def is_running_activity(payload: dict) -> bool:
    """Return whether a Strava payload is a running activity."""
    return (payload.get("sport_type") or payload.get("type")) in RUNNING_TYPES


def map_strava_activity(payload: dict) -> dict:
    """Map a Strava activity payload to local activity fields."""
    start_time_utc = parse_datetime(payload.get("start_date"))
    if start_time_utc is None:
        raise ValueError("Strava activity is missing start_date")
    local = payload.get("start_date_local")
    start_time_local = datetime.fromisoformat(local.replace("Z", "+00:00")).replace(tzinfo=None) if local else None
    return {
        "provider": "strava",
        "provider_activity_id": str(payload.get("id")),
        "sport_type": payload.get("sport_type") or payload.get("type"),
        "workout_type": _map_workout_type(payload.get("workout_type")),
        "name": payload.get("name"),
        "description": payload.get("description"),
        "start_time_utc": start_time_utc,
        "start_time_local": start_time_local,
        "timezone": payload.get("timezone"),
        "distance_m": payload.get("distance"),
        "moving_time_s": payload.get("moving_time"),
        "elapsed_time_s": payload.get("elapsed_time"),
        "elevation_gain_m": payload.get("total_elevation_gain"),
        "average_speed_mps": payload.get("average_speed"),
        "max_speed_mps": payload.get("max_speed"),
        "average_hr": payload.get("average_heartrate"),
        "max_hr": payload.get("max_heartrate"),
        "average_cadence": payload.get("average_cadence"),
        "calories": payload.get("calories"),
        "elevation_gain_source": "strava",
        "map_polyline": (payload.get("map") or {}).get("summary_polyline"),
        "source_payload": payload,
    }


def map_strava_streams(payload: dict) -> list[dict]:
    """Map Strava stream payloads to local stream rows."""
    streams = []
    for stream_type, stream_payload in payload.items():
        if stream_type not in STREAM_TYPES:
            continue
        data = stream_payload.get("data") if isinstance(stream_payload, dict) else stream_payload
        streams.append(
            {
                "stream_type": stream_type,
                "data": data or [],
                "sample_count": len(data or []),
            }
        )
    return streams


def _map_workout_type(workout_type: int | str | None) -> str | None:
    """Map Strava workout type values to a simple local label."""
    mapping = {1: "race", 2: "long", 3: "workout"}
    if workout_type is None:
        return None
    if isinstance(workout_type, int):
        return mapping.get(workout_type, "run")
    return str(workout_type)
