from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.profile import (
    ElevationRecomputeResponse,
    HeartRateRecomputeResponse,
    HeartRateZoneSetCreate,
    HeartRateZoneSetRead,
    UserPreferenceRead,
    UserPreferenceUpdate,
)
from app.services.elevation_service import recompute_user_elevation_metrics
from app.services.profile_service import (
    create_hr_zone_set,
    get_or_create_user_preferences,
    list_hr_zone_sets,
    recompute_user_hr_metrics,
    update_user_preferences,
)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/hr-zones", response_model=list[HeartRateZoneSetRead])
def get_hr_zones(session: DbSession, user: CurrentUser) -> list[HeartRateZoneSetRead]:
    """Return owner heart-rate zone history."""
    return [HeartRateZoneSetRead.model_validate(zone_set) for zone_set in list_hr_zone_sets(session, user.id)]


@router.post("/hr-zones", response_model=HeartRateZoneSetRead)
def post_hr_zones(payload: HeartRateZoneSetCreate, session: DbSession, user: CurrentUser) -> HeartRateZoneSetRead:
    """Create or replace one dated heart-rate zone set."""
    return HeartRateZoneSetRead.model_validate(create_hr_zone_set(session, user, payload))


@router.post("/hr-zones/recompute", response_model=HeartRateRecomputeResponse)
def post_hr_zones_recompute(session: DbSession, user: CurrentUser) -> HeartRateRecomputeResponse:
    """Recalculate HR-based load and intensity for imported activities."""
    return HeartRateRecomputeResponse(**recompute_user_hr_metrics(session, user.id))


@router.get("/preferences", response_model=UserPreferenceRead)
def get_preferences(session: DbSession, user: CurrentUser) -> UserPreferenceRead:
    """Return owner UI preferences."""
    return UserPreferenceRead.model_validate(get_or_create_user_preferences(session, user))


@router.patch("/preferences", response_model=UserPreferenceRead)
def patch_preferences(payload: UserPreferenceUpdate, session: DbSession, user: CurrentUser) -> UserPreferenceRead:
    """Update owner UI preferences."""
    return UserPreferenceRead.model_validate(update_user_preferences(session, user, payload))


@router.post("/elevation/recompute", response_model=ElevationRecomputeResponse)
def post_elevation_recompute(session: DbSession, user: CurrentUser) -> ElevationRecomputeResponse:
    """Recalculate GPS-based elevation for imported activities."""
    return ElevationRecomputeResponse(**recompute_user_elevation_metrics(session, user))
