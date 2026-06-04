from __future__ import annotations

from dataclasses import dataclass


HARD_ZONE_RATIO_THRESHOLD = 0.20


@dataclass(frozen=True)
class HeartRateZoneBreakdownItem:
    """Represent one heart-rate zone share for an activity."""

    zone_index: int
    name: str
    min_hr: int
    max_hr: int
    seconds: int
    sample_count: int
    percentage: float


def classify_intensity(
    moving_time_s: int | None,
    heartrate_stream: list[int | float] | None,
    hr_zones: list[tuple[int, int]] | None,
    rpe: float | None,
    workout_type: str | None,
) -> str:
    """Classify run intensity with documented V1 rules."""
    hard_workouts = {"race", "intervals", "tempo", "hills", "fartlek"}
    if workout_type in hard_workouts:
        return "hard"
    if heartrate_stream and hr_zones:
        low_zone = 0
        hard_zone = 0
        total = max(len(heartrate_stream), 1)
        for hr in heartrate_stream:
            zone_index = _zone_index(float(hr), hr_zones)
            if zone_index in {0, 1}:
                low_zone += 1
            if zone_index in {3, 4}:
                hard_zone += 1
        if hard_zone / total >= HARD_ZONE_RATIO_THRESHOLD:
            return "hard"
        if low_zone / total >= 0.70:
            return "easy"
        return "moderate"
    if rpe is not None:
        if rpe <= 4:
            return "easy"
        if rpe <= 6:
            return "moderate"
        return "hard"
    return "unknown"


def calculate_heart_rate_zone_breakdown(
    moving_time_s: int | None,
    heartrate_stream: list[int | float] | None,
    hr_zones: list[tuple[int, int]] | None,
    zone_names: list[str] | None = None,
) -> list[HeartRateZoneBreakdownItem]:
    """Calculate activity time spent in each heart-rate zone."""
    if not heartrate_stream or not hr_zones:
        return []
    counts = [0 for _ in hr_zones]
    for hr in heartrate_stream:
        counts[_zone_index(float(hr), hr_zones)] += 1
    total_samples = sum(counts)
    if total_samples <= 0:
        return []
    duration_s = max(int(round(moving_time_s if moving_time_s is not None else total_samples)), 0)
    seconds_by_zone = _distributed_zone_seconds(counts, duration_s, total_samples)
    safe_names = zone_names or []
    return [
        HeartRateZoneBreakdownItem(
            zone_index=index,
            name=safe_names[index] if index < len(safe_names) and safe_names[index] else f"Z{index + 1}",
            min_hr=zone_min,
            max_hr=zone_max,
            seconds=seconds_by_zone[index],
            sample_count=sample_count,
            percentage=round((sample_count / total_samples) * 100, 1),
        )
        for index, ((zone_min, zone_max), sample_count) in enumerate(zip(hr_zones, counts, strict=True))
    ]


def _zone_index(hr: float, hr_zones: list[tuple[int, int]]) -> int:
    """Return the index of the zone containing a heart-rate value."""
    if hr < hr_zones[0][0]:
        return 0
    if hr > hr_zones[-1][1]:
        return len(hr_zones) - 1
    for index, (zone_min, zone_max) in enumerate(hr_zones):
        if zone_min <= hr <= zone_max:
            return index
        if hr < zone_min:
            return max(index - 1, 0)
    return len(hr_zones) - 1


def _distributed_zone_seconds(counts: list[int], duration_s: int, total_samples: int) -> list[int]:
    """Return rounded zone seconds that add up to the activity duration."""
    if duration_s <= 0:
        return [0 for _ in counts]
    raw_seconds = [(count / total_samples) * duration_s for count in counts]
    seconds = [int(value) for value in raw_seconds]
    remainder = duration_s - sum(seconds)
    fractions = sorted(
        ((raw_seconds[index] - seconds[index], index) for index in range(len(counts))),
        key=lambda item: (-item[0], item[1]),
    )
    for _, index in fractions[:remainder]:
        seconds[index] += 1
    return seconds
