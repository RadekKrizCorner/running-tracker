from __future__ import annotations


def calculate_positive_elevation_gain(elevations: list[float], noise_threshold_m: float = 3.0) -> float:
    """Calculate positive elevation gain while ignoring small elevation noise."""
    values = _numeric_elevations(elevations)
    if len(values) < 2:
        return 0.0
    gain = 0.0
    low = values[0]
    high = values[0]
    for value in values[1:]:
        if value < high - noise_threshold_m:
            gain += _confirmed_gain(low, high, noise_threshold_m)
            low = value
            high = value
            continue
        if value < low:
            low = value
            high = value
            continue
        if value > high:
            high = value
    gain += _confirmed_gain(low, high, noise_threshold_m)
    return gain


def _numeric_elevations(elevations: list[float]) -> list[float]:
    """Return finite numeric elevation values."""
    return [float(value) for value in elevations if isinstance(value, int | float) and not isinstance(value, bool)]


def _confirmed_gain(low: float, high: float, noise_threshold_m: float) -> float:
    """Return a climb only when it clears the noise threshold."""
    gain = high - low
    return gain if gain >= noise_threshold_m else 0.0
