from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

HillPreference = Literal["flat", "balanced", "hilly"]
SurfacePreference = Literal["road", "mixed", "trail"]
RouteSuggestionStatus = Literal["ok", "unavailable"]


class RouteSuggestionRequest(BaseModel):
    """Represent route loop suggestion inputs."""

    start_lat: float = Field(ge=-90, le=90)
    start_lng: float = Field(ge=-180, le=180)
    target_distance_m: int = Field(ge=500, le=50000)
    distance_tolerance_m: int = Field(default=1000, ge=100, le=10000)
    hill_preference: HillPreference = "balanced"
    surface_preference: SurfacePreference = "mixed"
    candidate_count: int = Field(default=3, ge=1, le=6)


class RouteCandidate(BaseModel):
    """Represent one generated route candidate."""

    id: str
    name: str
    distance_m: float
    duration_s: int | None = None
    elevation_gain_m: float | None = None
    geometry: list[tuple[float, float]]
    provider: str
    score: float
    warnings: list[str] = Field(default_factory=list)


class RouteSuggestionResponse(BaseModel):
    """Represent route loop suggestion results."""

    status: RouteSuggestionStatus
    detail: str
    candidates: list[RouteCandidate] = Field(default_factory=list)
