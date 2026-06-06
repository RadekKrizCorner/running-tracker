from __future__ import annotations

from uuid import UUID

from app.core.config import Settings
from app.core.exceptions import AppException
from app.providers.routing.valhalla import request_valhalla_loop_routes
from app.schemas.route_planning import (
    RouteCandidate,
    RouteSuggestionRequest,
    RouteSuggestionResponse,
)

MALFORMED_PROVIDER_DETAIL = "Routing provider returned an unusable response."
UNUSABLE_CANDIDATES_DETAIL = "Routing provider returned only unusable or out-of-range route candidates."


def suggest_loop_routes(
    settings: Settings,
    user_id: UUID,
    request: RouteSuggestionRequest,
) -> RouteSuggestionResponse:
    """Return loop route suggestions for an owner."""
    _ = user_id
    if not settings.routing_enabled:
        return _unavailable("Route suggestions are disabled. Configure local Valhalla to enable this feature.")
    if settings.routing_provider != "valhalla":
        return _unavailable("Configured routing provider is not supported.")
    if not settings.valhalla_base_url:
        return _unavailable("Valhalla URL is not configured.")
    if request.target_distance_m > settings.route_suggestion_max_distance_m:
        return _unavailable("Requested route distance is above the configured local routing limit.")

    capped_request = request.model_copy(update={"candidate_count": min(request.candidate_count, 6)})
    try:
        candidates = request_valhalla_loop_routes(settings.valhalla_base_url, capped_request)
    except AppException as exc:
        return _unavailable(exc.detail)
    except Exception:
        return _unavailable(MALFORMED_PROVIDER_DETAIL)
    if not candidates:
        return _unavailable("Routing provider returned no route candidates.")
    candidates = _usable_candidates(candidates, request)
    if not candidates:
        return _unavailable(UNUSABLE_CANDIDATES_DETAIL)
    return RouteSuggestionResponse(
        status="ok",
        detail="Route suggestions generated from local Valhalla.",
        candidates=_limit_candidates(candidates, capped_request.candidate_count),
    )


def _unavailable(detail: str) -> RouteSuggestionResponse:
    """Return an unavailable route suggestion response."""
    return RouteSuggestionResponse(status="unavailable", detail=detail, candidates=[])


def _limit_candidates(candidates: list[RouteCandidate], candidate_count: int) -> list[RouteCandidate]:
    """Return candidates capped to the requested count."""
    return candidates[: max(1, min(candidate_count, 6))]


def _usable_candidates(candidates: list[RouteCandidate], request: RouteSuggestionRequest) -> list[RouteCandidate]:
    """Return route candidates with usable geometry and requested distance."""
    return [candidate for candidate in candidates if _is_usable_candidate(candidate, request)]


def _is_usable_candidate(candidate: RouteCandidate, request: RouteSuggestionRequest) -> bool:
    """Return whether a route candidate is usable for the request."""
    if candidate.distance_m <= 0:
        return False
    if not candidate.geometry:
        return False
    minimum_distance = request.target_distance_m - request.distance_tolerance_m
    maximum_distance = request.target_distance_m + request.distance_tolerance_m
    return minimum_distance <= candidate.distance_m <= maximum_distance
