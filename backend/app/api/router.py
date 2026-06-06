from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    activities,
    analytics,
    auth,
    connections_strava,
    events,
    gear,
    notifications,
    planning,
    privacy,
    profile,
    reports,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(connections_strava.router)
api_router.include_router(activities.router)
api_router.include_router(analytics.router)
api_router.include_router(events.router)
api_router.include_router(gear.router)
api_router.include_router(planning.router)
api_router.include_router(notifications.router)
api_router.include_router(privacy.router)
api_router.include_router(profile.router)
api_router.include_router(reports.router)
