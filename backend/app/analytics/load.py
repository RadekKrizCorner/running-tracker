from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LoadResult:
    """Represent a load value and its calculation source."""

    load: float
    source: str


ZONE_WEIGHTS = [1, 2, 3, 5, 8]


def calculate_training_load(
    moving_time_s: int | None,
    heartrate_stream: list[int | float] | None,
    hr_zones: list[tuple[int, int]] | None,
    rpe: float | None,
) -> LoadResult:
    """Calculate transparent V1 training load."""
    duration_minutes = max((moving_time_s or 0) / 60.0, 0)
    if heartrate_stream and hr_zones:
        seconds_per_sample = (moving_time_s or len(heartrate_stream)) / max(len(heartrate_stream), 1)
        zone_seconds = [0.0 for _ in hr_zones]
        for hr in heartrate_stream:
            for index, (zone_min, zone_max) in enumerate(hr_zones):
                if zone_min <= hr <= zone_max:
                    zone_seconds[index] += seconds_per_sample
                    break
        load = sum((seconds / 60.0) * ZONE_WEIGHTS[index] for index, seconds in enumerate(zone_seconds))
        return LoadResult(load=round(load, 2), source="hr_based")
    if rpe is not None:
        return LoadResult(load=round(duration_minutes * float(rpe), 2), source="rpe_based")
    return LoadResult(load=round(duration_minutes * 2.0, 2), source="duration_estimated")

