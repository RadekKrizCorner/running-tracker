from __future__ import annotations

import math

from app.schemas.route_planning import RouteCandidate, RouteSuggestionRequest

LOCAL_DEMO_PROVIDER = "local_demo"
EARTH_RADIUS_M = 6_371_000
LOOP_SEGMENTS = 32


def generate_local_demo_loop_routes(request: RouteSuggestionRequest) -> list[RouteCandidate]:
    """Generate approximate local loop route candidates."""
    candidates: list[RouteCandidate] = []
    for index, bearing in enumerate(_candidate_bearings(request.candidate_count), start=1):
        geometry = _loop_geometry(request.start_lat, request.start_lng, request.target_distance_m, bearing)
        distance_m = _geometry_distance_m(geometry)
        candidates.append(
            RouteCandidate(
                id=f"local-demo-{index}",
                name=_candidate_name(distance_m, request.surface_preference),
                distance_m=distance_m,
                duration_s=_duration_s(distance_m, request.hill_preference, request.surface_preference),
                elevation_gain_m=_elevation_gain_m(distance_m, request.hill_preference, index),
                geometry=geometry,
                provider=LOCAL_DEMO_PROVIDER,
                score=_candidate_score(index, request.surface_preference),
                warnings=_candidate_warnings(request.surface_preference),
            )
        )
    return candidates


def _candidate_bearings(candidate_count: int) -> list[float]:
    """Return distributed bearings for local demo route candidates."""
    count = max(1, min(candidate_count, 6))
    return [(360 / count) * index for index in range(count)]


def _loop_geometry(
    start_latitude: float,
    start_longitude: float,
    target_distance_m: int,
    bearing_degrees: float,
) -> list[tuple[float, float]]:
    """Return an approximate circular loop geometry."""
    radius_m = max(target_distance_m / (2 * math.pi), 120)
    center_latitude, center_longitude = _destination(
        start_latitude,
        start_longitude,
        bearing_degrees,
        radius_m,
    )
    start_angle = (bearing_degrees + 180) % 360
    points = [(round(start_latitude, 6), round(start_longitude, 6))]
    for step in range(1, LOOP_SEGMENTS):
        angle = start_angle + (360 * step / LOOP_SEGMENTS)
        points.append(_destination(center_latitude, center_longitude, angle, radius_m))
    points.append((round(start_latitude, 6), round(start_longitude, 6)))
    return points


def _destination(latitude: float, longitude: float, bearing_degrees: float, distance_m: float) -> tuple[float, float]:
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


def _geometry_distance_m(geometry: list[tuple[float, float]]) -> float:
    """Return total distance for a route geometry."""
    return sum(_haversine_m(start, end) for start, end in zip(geometry, geometry[1:], strict=False))


def _haversine_m(start: tuple[float, float], end: tuple[float, float]) -> float:
    """Return haversine distance between two coordinates."""
    start_latitude, start_longitude = (math.radians(start[0]), math.radians(start[1]))
    end_latitude, end_longitude = (math.radians(end[0]), math.radians(end[1]))
    lat_delta = end_latitude - start_latitude
    lng_delta = end_longitude - start_longitude
    value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(start_latitude) * math.cos(end_latitude) * math.sin(lng_delta / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(value))


def _candidate_name(distance_m: float, surface_preference: str) -> str:
    """Return a display name for a local demo candidate."""
    surface = {
        "road": "road",
        "mixed": "mixed",
        "trail": "trail",
    }.get(surface_preference, "mixed")
    return f"Demo {surface} loop {distance_m / 1000:.1f} km"


def _duration_s(distance_m: float, hill_preference: str, surface_preference: str) -> int:
    """Return estimated duration for a local demo candidate."""
    hill_adjustment = {"flat": -15, "balanced": 0, "hilly": 30}.get(hill_preference, 0)
    surface_adjustment = {"road": -10, "mixed": 0, "trail": 25}.get(surface_preference, 0)
    pace_seconds_per_km = 360 + hill_adjustment + surface_adjustment
    return round((distance_m / 1000) * pace_seconds_per_km)


def _elevation_gain_m(distance_m: float, hill_preference: str, index: int) -> float:
    """Return approximate elevation gain for a local demo candidate."""
    gain_factor = {
        "flat": 0.004,
        "balanced": 0.012,
        "hilly": 0.025,
    }.get(hill_preference, 0.012)
    return round((distance_m * gain_factor) + (index - 1) * 12, 1)


def _candidate_score(index: int, surface_preference: str) -> float:
    """Return a local demo candidate score."""
    surface_bonus = {"road": 0.02, "mixed": 0.04, "trail": 0.03}.get(surface_preference, 0.03)
    return max(0.45, round(0.86 + surface_bonus - ((index - 1) * 0.07), 2))


def _candidate_warnings(surface_preference: str) -> list[str]:
    """Return warnings for local demo route candidates."""
    warnings = ["Approximate demo route; not snapped to roads."]
    if surface_preference == "road":
        warnings.append("Road preference is approximated without a road graph.")
    elif surface_preference == "trail":
        warnings.append("Trail preference is approximated without a trail graph.")
    return warnings
