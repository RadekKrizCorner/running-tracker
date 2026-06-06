from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.tests.conftest import setup_and_login


def test_route_suggestion_request_validates_bounds() -> None:
    """Verify route suggestion requests reject impossible values."""
    from app.core.config import Settings
    from app.schemas.route_planning import RouteSuggestionRequest

    request = RouteSuggestionRequest(
        start_lat=50.0755,
        start_lng=14.4378,
        target_distance_m=12000,
        distance_tolerance_m=800,
        hill_preference="balanced",
        surface_preference="mixed",
        candidate_count=3,
    )
    settings = Settings()

    assert request.start_lat == 50.0755
    assert request.start_lng == 14.4378
    assert settings.routing_enabled is False
    assert settings.routing_provider == "valhalla"
    assert settings.route_suggestion_max_distance_m == 50000

    invalid_payloads = [
        {"start_lat": 91.0},
        {"start_lng": 181.0},
        {"target_distance_m": 200},
        {"target_distance_m": 75000},
        {"distance_tolerance_m": 0},
        {"hill_preference": "vertical"},
        {"surface_preference": "sand"},
        {"candidate_count": 0},
        {"candidate_count": 8},
    ]
    base_payload = request.model_dump()
    for override in invalid_payloads:
        with pytest.raises(ValidationError):
            RouteSuggestionRequest(**{**base_payload, **override})


def test_valhalla_loop_payload_maps_preferences() -> None:
    """Verify Valhalla loop payload uses route preferences."""
    from app.providers.routing.valhalla import build_valhalla_loop_payload
    from app.schemas.route_planning import RouteSuggestionRequest

    request = RouteSuggestionRequest(
        start_lat=50.0755,
        start_lng=14.4378,
        target_distance_m=12000,
        distance_tolerance_m=750,
        hill_preference="flat",
        surface_preference="trail",
        candidate_count=2,
    )

    payload = build_valhalla_loop_payload(request, bearing_degrees=90)

    locations = payload["locations"]
    assert len(locations) == 4
    assert locations[0] == {"lat": 50.0755, "lon": 14.4378, "type": "break"}
    assert locations[-1] == {"lat": 50.0755, "lon": 14.4378, "type": "break"}
    assert locations[1]["type"] == "through"
    assert locations[2]["type"] == "through"
    assert locations[1]["lat"] != 50.0755
    assert locations[1]["lon"] > 14.4378
    assert payload["costing"] == "pedestrian"
    assert payload["costing_options"]["pedestrian"]["walking_speed"] == 10
    assert payload["costing_options"]["pedestrian"]["use_hills"] == 0.15
    assert payload["costing_options"]["pedestrian"]["use_tracks"] == 0.85
    assert payload["costing_options"]["pedestrian"]["max_hiking_difficulty"] == 2
    assert payload["directions_options"]["units"] == "kilometers"
    assert payload["shape_format"] == "polyline6"
    assert payload["roundabout_exits"] is False


def test_valhalla_response_normalizes_candidates() -> None:
    """Verify Valhalla responses normalize into route candidates."""
    from app.providers.routing.valhalla import normalize_valhalla_response

    payload = {
        "trip": {
            "status": 0,
            "status_message": "Found route",
            "summary": {"length": 12.4, "time": 3920},
            "legs": [
                {
                    "shape": "wujo~AoyepZw|A_gE~iA_gE",
                    "summary": {"length": 12.4, "time": 3920},
                }
            ],
        },
        "alternates": [
            {
                "trip": {
                    "status": 0,
                    "status_message": "Found alternate",
                    "summary": {"length": 11.9, "time": 3810},
                    "legs": [
                        {
                            "shape": "wujo~AoyepZw|A_gE~iA_gE",
                            "summary": {"length": 11.9, "time": 3810},
                        }
                    ],
                }
            }
        ],
    }

    candidates = normalize_valhalla_response(payload)

    assert len(candidates) == 2
    assert candidates[0].id == "valhalla-1"
    assert candidates[0].name == "Loop 12.4 km"
    assert candidates[0].distance_m == pytest.approx(12400)
    assert candidates[0].duration_s == 3920
    assert candidates[0].elevation_gain_m is None
    assert candidates[0].provider == "valhalla"
    assert candidates[0].score == pytest.approx(1.0)
    assert candidates[0].warnings == []
    assert candidates[0].geometry == pytest.approx(
        [(50.0755, 14.4378), (50.077, 14.441), (50.0758, 14.4442)]
    )
    assert candidates[1].id == "valhalla-2"
    assert candidates[1].score < candidates[0].score


def test_route_suggestion_rejects_unauthenticated_client(client: TestClient) -> None:
    """Verify route suggestions require owner authentication."""
    response = client.post("/api/v1/routes/suggest-loop", json=_route_request_payload())

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_route_suggestion_returns_unavailable_when_disabled(client: TestClient) -> None:
    """Verify disabled routing returns a clear unavailable response."""
    setup_and_login(client)

    response = client.post("/api/v1/routes/suggest-loop", json=_route_request_payload())

    assert response.status_code == 200
    assert response.json() == {
        "status": "unavailable",
        "detail": "Route suggestions are disabled. Configure local Valhalla to enable this feature.",
        "candidates": [],
    }


def test_route_suggestion_service_returns_unavailable_when_provider_returns_no_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify empty provider responses return unavailable route suggestions."""
    from app.core.config import Settings
    from app.schemas.route_planning import RouteSuggestionRequest
    from app.services import route_planning_service

    monkeypatch.setattr(route_planning_service, "request_valhalla_loop_routes", lambda _base_url, _request: [])
    settings = Settings(routing_enabled=True, valhalla_base_url="http://valhalla.test")
    request = RouteSuggestionRequest(**_route_request_payload())

    response = route_planning_service.suggest_loop_routes(settings, uuid4(), request)

    assert response.status == "unavailable"
    assert response.detail == "Routing provider returned no route candidates."
    assert response.candidates == []


def _route_request_payload() -> dict[str, object]:
    """Return a valid route suggestion request payload."""
    return {
        "start_lat": 50.0755,
        "start_lng": 14.4378,
        "target_distance_m": 12000,
        "distance_tolerance_m": 800,
        "hill_preference": "balanced",
        "surface_preference": "mixed",
        "candidate_count": 3,
    }
