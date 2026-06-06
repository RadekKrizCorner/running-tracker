from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, SettingsDep
from app.schemas.route_planning import RouteSuggestionRequest, RouteSuggestionResponse
from app.services.route_planning_service import suggest_loop_routes

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/suggest-loop", response_model=RouteSuggestionResponse)
def suggest_loop_route(
    payload: RouteSuggestionRequest,
    settings: SettingsDep,
    user: CurrentUser,
) -> RouteSuggestionResponse:
    """Return owner-authenticated loop route suggestions."""
    return suggest_loop_routes(settings, user.id, payload)
