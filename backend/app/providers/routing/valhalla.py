from __future__ import annotations

import math
from typing import Any

import httpx

from app.core.exceptions import AppException
from app.schemas.route_planning import RouteCandidate, RouteSuggestionRequest

VALHALLA_PROVIDER = "valhalla"
EARTH_RADIUS_M = 6_371_000


def build_valhalla_loop_payload(request: RouteSuggestionRequest, bearing_degrees: float = 0) -> dict[str, Any]:
    """Build a Valhalla loop route request payload."""
    pedestrian_options = {
        "walking_speed": 10,
        "use_hills": _hill_cost(request.hill_preference),
        "use_tracks": _surface_cost(request.surface_preference),
        "max_hiking_difficulty": _max_hiking_difficulty(request.surface_preference),
    }
    return {
        "locations": _loop_locations(request, bearing_degrees),
        "costing": "pedestrian",
        "costing_options": {"pedestrian": pedestrian_options},
        "directions_options": {"units": "kilometers"},
        "shape_format": "polyline6",
        "roundabout_exits": False,
    }


def normalize_valhalla_response(payload: dict[str, Any]) -> list[RouteCandidate]:
    """Normalize a Valhalla response into route candidates."""
    candidates: list[RouteCandidate] = []
    for index, trip in enumerate(_trip_payloads(payload), start=1):
        candidate = _candidate_from_trip(trip, index)
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def request_valhalla_loop_routes(base_url: str, request: RouteSuggestionRequest) -> list[RouteCandidate]:
    """Request loop route candidates from a local Valhalla service."""
    url = f"{base_url.rstrip('/')}/route"
    candidates: list[RouteCandidate] = []
    try:
        with httpx.Client(timeout=30) as client:
            for bearing in _candidate_bearings(request.candidate_count):
                payload = build_valhalla_loop_payload(request, bearing)
                response = client.post(url, json=payload)
                response.raise_for_status()
                for candidate in normalize_valhalla_response(response.json()):
                    index = len(candidates) + 1
                    candidates.append(
                        candidate.model_copy(
                            update={
                                "id": f"valhalla-{index}",
                                "score": _candidate_score(index, candidate.warnings),
                            }
                        )
                    )
                    if len(candidates) >= request.candidate_count:
                        return candidates
    except httpx.HTTPError as exc:
        raise AppException(503, "ROUTING_PROVIDER_UNAVAILABLE", "Routing provider is unavailable") from exc
    return candidates


def _hill_cost(preference: str) -> float:
    """Return Valhalla hill preference cost."""
    return {
        "flat": 0.15,
        "balanced": 0.45,
        "hilly": 0.85,
    }.get(preference, 0.45)


def _surface_cost(preference: str) -> float:
    """Return Valhalla track preference cost."""
    return {
        "road": 0.15,
        "mixed": 0.5,
        "trail": 0.85,
    }.get(preference, 0.5)


def _max_hiking_difficulty(preference: str) -> int:
    """Return allowed hiking difficulty for the surface preference."""
    return {
        "road": 0,
        "mixed": 1,
        "trail": 2,
    }.get(preference, 1)


def _loop_locations(request: RouteSuggestionRequest, bearing_degrees: float) -> list[dict[str, float | str]]:
    """Return start, through waypoints, and closed start locations."""
    start = {"lat": request.start_lat, "lon": request.start_lng, "type": "break"}
    radius_m = _loop_radius_m(request.target_distance_m)
    first_waypoint = _waypoint(request.start_lat, request.start_lng, bearing_degrees, radius_m)
    second_waypoint = _waypoint(request.start_lat, request.start_lng, bearing_degrees + 120, radius_m)
    return [
        start,
        {"lat": first_waypoint[0], "lon": first_waypoint[1], "type": "through"},
        {"lat": second_waypoint[0], "lon": second_waypoint[1], "type": "through"},
        dict(start),
    ]


def _loop_radius_m(target_distance_m: int) -> float:
    """Return an approximate waypoint radius for a loop target."""
    return max(target_distance_m / 3.75, 250)


def _waypoint(latitude: float, longitude: float, bearing_degrees: float, distance_m: float) -> tuple[float, float]:
    """Return a destination coordinate for a bearing and distance."""
    bearing = math.radians(bearing_degrees % 360)
    lat1 = math.radians(latitude)
    lng1 = math.radians(longitude)
    angular_distance = distance_m / EARTH_RADIUS_M

    lat2 = math.asin(
        (math.sin(lat1) * math.cos(angular_distance))
        + (math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing))
    )
    lng2 = lng1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - (math.sin(lat1) * math.sin(lat2)),
    )
    normalized_lng = ((math.degrees(lng2) + 540) % 360) - 180
    return (round(math.degrees(lat2), 6), round(normalized_lng, 6))


def _candidate_bearings(candidate_count: int) -> list[float]:
    """Return distributed bearings for route candidates."""
    count = max(1, min(candidate_count, 6))
    return [(360 / count) * index for index in range(count)]


def _trip_payloads(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return primary and alternate Valhalla trips."""
    trips: list[dict[str, Any]] = []
    if isinstance(payload.get("trip"), dict):
        trips.append(payload["trip"])
    alternates = payload.get("alternates")
    if isinstance(alternates, list):
        for alternate in alternates:
            if isinstance(alternate, dict) and isinstance(alternate.get("trip"), dict):
                trips.append(alternate["trip"])
    return trips


def _candidate_from_trip(trip: dict[str, Any], index: int) -> RouteCandidate | None:
    """Convert one Valhalla trip into a route candidate."""
    summary = trip.get("summary") if isinstance(trip.get("summary"), dict) else {}
    legs = trip.get("legs") if isinstance(trip.get("legs"), list) else []
    distance_m = _distance_m(summary, legs)
    duration_s = _duration_s(summary, legs)
    geometry = _geometry(legs)
    warnings = _warnings(trip, geometry)
    if distance_m <= 0:
        warnings.append("Distance unavailable")
    return RouteCandidate(
        id=f"valhalla-{index}",
        name=f"Loop {distance_m / 1000:.1f} km",
        distance_m=distance_m,
        duration_s=duration_s,
        elevation_gain_m=_elevation_gain_m(summary, legs),
        geometry=geometry,
        provider=VALHALLA_PROVIDER,
        score=_candidate_score(index, warnings),
        warnings=warnings,
    )


def _distance_m(summary: dict[str, Any], legs: list[Any]) -> float:
    """Return route distance in meters."""
    length = _numeric(summary.get("length"))
    if length is None:
        length = sum((_numeric(_leg_summary(leg).get("length")) or 0) for leg in legs)
    return float(length or 0) * 1000


def _duration_s(summary: dict[str, Any], legs: list[Any]) -> int | None:
    """Return route duration in seconds."""
    duration = _numeric(summary.get("time"))
    if duration is None:
        duration = sum((_numeric(_leg_summary(leg).get("time")) or 0) for leg in legs)
    return int(round(duration)) if duration is not None else None


def _elevation_gain_m(summary: dict[str, Any], legs: list[Any]) -> float | None:
    """Return route elevation gain when Valhalla provides it."""
    value = _numeric(summary.get("elevation_gain"))
    if value is not None:
        return value
    leg_values = [_numeric(_leg_summary(leg).get("elevation_gain")) for leg in legs]
    known = [item for item in leg_values if item is not None]
    return sum(known) if known else None


def _geometry(legs: list[Any]) -> list[tuple[float, float]]:
    """Decode all Valhalla leg shapes into latitude and longitude pairs."""
    points: list[tuple[float, float]] = []
    for leg in legs:
        if not isinstance(leg, dict):
            continue
        shape = leg.get("shape")
        if not isinstance(shape, str) or not shape:
            continue
        leg_points = _decode_polyline6(shape)
        if points and leg_points and points[-1] == leg_points[0]:
            points.extend(leg_points[1:])
        else:
            points.extend(leg_points)
    return points


def _decode_polyline6(value: str) -> list[tuple[float, float]]:
    """Decode an encoded polyline6 string."""
    coordinates: list[tuple[float, float]] = []
    index = 0
    latitude = 0
    longitude = 0
    while index < len(value):
        lat_change, index = _decode_chunk(value, index)
        lng_change, index = _decode_chunk(value, index)
        latitude += lat_change
        longitude += lng_change
        coordinates.append((latitude / 1e6, longitude / 1e6))
    return coordinates


def _decode_chunk(value: str, start_index: int) -> tuple[int, int]:
    """Decode one encoded polyline chunk."""
    result = 0
    shift = 0
    index = start_index
    while index < len(value):
        byte = ord(value[index]) - 63
        index += 1
        result |= (byte & 0x1F) << shift
        shift += 5
        if byte < 0x20:
            break
    change = ~(result >> 1) if result & 1 else result >> 1
    return change, index


def _leg_summary(leg: Any) -> dict[str, Any]:
    """Return a leg summary dictionary."""
    if isinstance(leg, dict) and isinstance(leg.get("summary"), dict):
        return leg["summary"]
    return {}


def _numeric(value: Any) -> float | None:
    """Return a numeric value as float."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _warnings(trip: dict[str, Any], geometry: list[tuple[float, float]]) -> list[str]:
    """Return warnings for a normalized trip."""
    warnings: list[str] = []
    status = trip.get("status")
    if status not in (None, 0):
        message = trip.get("status_message")
        warnings.append(str(message or "Provider returned a non-ok status"))
    if not geometry:
        warnings.append("Geometry unavailable")
    return warnings


def _candidate_score(index: int, warnings: list[str]) -> float:
    """Return a simple candidate score."""
    score = 1.0 - ((index - 1) * 0.1) - (len(warnings) * 0.05)
    return round(max(score, 0), 3)
