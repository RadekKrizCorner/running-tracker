from __future__ import annotations

from collections.abc import Iterable
from collections.abc import Callable
import time

import httpx

from app.core.exceptions import AppException

ELEVATION_LOOKUP_CHUNK_SIZE = 100
ELEVATION_PROVIDER_MAX_ATTEMPTS = 3
ELEVATION_PROVIDER_RETRY_DELAY_S = 1.0
ELEVATION_PROVIDER_RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


class ElevationClient:
    """Fetch DEM elevations for GPS coordinates from a configured HTTP provider."""

    def __init__(self, provider_url: str, timeout_s: float = 20.0) -> None:
        """Create an elevation client for one provider URL."""
        self.provider_url = provider_url
        self.timeout_s = timeout_s

    def lookup_elevations(self, points: list[tuple[float, float]]) -> list[float]:
        """Return elevations for latitude and longitude points."""
        elevations: list[float] = []
        for chunk in _chunks(points, ELEVATION_LOOKUP_CHUNK_SIZE):
            elevations.extend(self._lookup_chunk(chunk))
        return elevations

    def _lookup_chunk(self, points: list[tuple[float, float]]) -> list[float]:
        """Fetch elevations for one chunk of coordinates."""
        if _is_open_meteo_url(self.provider_url):
            return self._lookup_open_meteo_chunk(points)
        payload = {"locations": [{"latitude": lat, "longitude": lng} for lat, lng in points]}
        response = _request_with_retries(httpx.post, self.provider_url, json=payload, timeout=self.timeout_s)
        elevations = _parse_elevation_response(response.json())
        if len(elevations) != len(points):
            raise AppException(502, "ELEVATION_PROVIDER_INVALID", "Elevation provider returned incomplete data")
        return elevations

    def _lookup_open_meteo_chunk(self, points: list[tuple[float, float]]) -> list[float]:
        """Fetch elevations from the Open-Meteo Elevation API."""
        params = {
            "latitude": ",".join(_format_coordinate(lat) for lat, _lng in points),
            "longitude": ",".join(_format_coordinate(lng) for _lat, lng in points),
        }
        response = _request_with_retries(httpx.get, self.provider_url, params=params, timeout=self.timeout_s)
        elevations = _parse_elevation_response(response.json())
        if len(elevations) != len(points):
            raise AppException(502, "ELEVATION_PROVIDER_INVALID", "Elevation provider returned incomplete data")
        return elevations


def _request_with_retries(request_func: Callable[..., httpx.Response], url: str, **kwargs: object) -> httpx.Response:
    """Perform an elevation provider request with short transient-error retries."""
    for attempt in range(1, ELEVATION_PROVIDER_MAX_ATTEMPTS + 1):
        try:
            response = request_func(url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if _should_retry_status(exc.response.status_code, attempt):
                time.sleep(ELEVATION_PROVIDER_RETRY_DELAY_S * attempt)
                continue
            raise AppException(502, "ELEVATION_PROVIDER_FAILED", "Elevation provider request failed") from exc
        except httpx.RequestError as exc:
            if _should_retry_request(attempt):
                time.sleep(ELEVATION_PROVIDER_RETRY_DELAY_S * attempt)
                continue
            raise AppException(502, "ELEVATION_PROVIDER_FAILED", "Elevation provider request failed") from exc
    raise AppException(502, "ELEVATION_PROVIDER_FAILED", "Elevation provider request failed")


def _should_retry_status(status_code: int, attempt: int) -> bool:
    """Return whether a provider HTTP status should be retried."""
    return status_code in ELEVATION_PROVIDER_RETRY_STATUS_CODES and attempt < ELEVATION_PROVIDER_MAX_ATTEMPTS


def _should_retry_request(attempt: int) -> bool:
    """Return whether a provider transport error should be retried."""
    return attempt < ELEVATION_PROVIDER_MAX_ATTEMPTS


def _parse_elevation_response(payload: object) -> list[float]:
    """Parse common elevation provider response shapes."""
    if isinstance(payload, list):
        return _numeric_elevations(payload)
    if not isinstance(payload, dict):
        raise AppException(502, "ELEVATION_PROVIDER_INVALID", "Elevation provider response was invalid")
    if isinstance(payload.get("elevations"), list):
        return _numeric_elevations(payload["elevations"])
    if isinstance(payload.get("elevation"), list):
        return _numeric_elevations(payload["elevation"])
    if isinstance(payload.get("results"), list):
        return _numeric_elevations([item.get("elevation") for item in payload["results"] if isinstance(item, dict)])
    raise AppException(502, "ELEVATION_PROVIDER_INVALID", "Elevation provider response was invalid")


def _numeric_elevations(values: Iterable[object]) -> list[float]:
    """Return numeric elevation values from a provider response."""
    elevations: list[float] = []
    for value in values:
        if not isinstance(value, int | float) or isinstance(value, bool):
            raise AppException(502, "ELEVATION_PROVIDER_INVALID", "Elevation provider returned non-numeric data")
        elevations.append(float(value))
    return elevations


def _chunks(points: list[tuple[float, float]], size: int) -> Iterable[list[tuple[float, float]]]:
    """Yield coordinate chunks of a fixed maximum size."""
    for index in range(0, len(points), size):
        yield points[index : index + size]


def _is_open_meteo_url(provider_url: str) -> bool:
    """Return whether a provider URL targets Open-Meteo elevation."""
    return "api.open-meteo.com" in provider_url and "/v1/elevation" in provider_url


def _format_coordinate(value: float) -> str:
    """Format a coordinate without unnecessary trailing zeros."""
    formatted = f"{value:.6f}".rstrip("0").rstrip(".")
    return formatted if "." in formatted else f"{formatted}.0"
