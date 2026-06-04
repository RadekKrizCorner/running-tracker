from __future__ import annotations

from app.models.activity import Activity, activity_gear
from app.models.activity_note import ActivityNote
from app.models.activity_stream import ActivityStream
from app.models.calendar_event import CalendarEvent
from app.models.event import Event
from app.models.gear import Gear
from app.models.heart_rate_zone_set import HeartRateZoneSet
from app.models.notification import Notification
from app.models.planning import PlannedWorkout, TrainingPlan, WorkoutPoolItem, WorkoutStep, WorkoutTemplate
from app.models.provider_connection import ProviderConnection
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.weekly_metric import WeeklyMetric

__all__ = [
    "Activity",
    "ActivityNote",
    "ActivityStream",
    "CalendarEvent",
    "Event",
    "Gear",
    "HeartRateZoneSet",
    "Notification",
    "PlannedWorkout",
    "ProviderConnection",
    "TrainingPlan",
    "User",
    "UserPreference",
    "WeeklyMetric",
    "WorkoutPoolItem",
    "WorkoutStep",
    "WorkoutTemplate",
    "activity_gear",
]
