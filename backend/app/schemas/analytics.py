from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class MetricCard(BaseModel):
    """Represent one dashboard metric."""

    value: float
    previous_value: float | None = None
    unit: str


class DashboardResponse(BaseModel):
    """Represent dashboard analytics."""

    period: str
    this_week: dict[str, float | int | None]
    trends: dict[str, float | int | None]
    intensity_split: dict[str, int]
    weekly: list[dict]
    recent_activities: list[dict]
    upcoming_workouts: list[dict]
    week_plan: dict


class WeeklyMetricRead(BaseModel):
    """Represent weekly analytics."""

    week_start_date: date
    distance_m: float
    moving_time_s: int
    elevation_gain_m: float
    run_count: int
    load: float
    acute_load: float
    chronic_load: float
    ramp_ratio: float | None
    easy_time_s: int
    moderate_time_s: int
    hard_time_s: int
    unknown_time_s: int
    long_run_distance_m: float


class YearlyRunningSummary(BaseModel):
    """Represent yearly running totals."""

    year: int
    distance_m: float
    elevation_gain_m: float
    moving_time_s: int


class TrendMetricWeek(BaseModel):
    """Represent detailed weekly trend metrics."""

    week_start_date: date
    distance_m: float
    moving_time_s: int
    elevation_gain_m: float
    run_count: int
    load: float
    zone_seconds: list[int]
    easy_pace_s_per_km: float | None
    long_run_share: float
    run_day_count: int
    elevation_gain_per_km: float
    zone_paces_s_per_km: list[float | None]
    planned_distance_m: float
    completed_distance_m: float
    planned_time_s: int
    completed_time_s: int
    planned_load: float
    completed_load: float
    distance_adherence: float | None
    time_adherence: float | None
    load_adherence: float | None
    monotony: float | None
    coach_intent: str
    coach_stimulus: str
    coach_response: str
    coach_recommendation: str


class HeatmapPoint(BaseModel):
    """Represent one aggregated GPS heatmap point."""

    lat: float
    lng: float
    weight: int
    activity_count: int


class HeatmapBounds(BaseModel):
    """Represent map bounds for heatmap points."""

    south: float
    west: float
    north: float
    east: float


class HeatmapResponse(BaseModel):
    """Represent owner running route heatmap analytics."""

    points: list[HeatmapPoint]
    bounds: HeatmapBounds | None
    activity_count: int
    point_count: int
