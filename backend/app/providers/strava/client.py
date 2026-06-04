from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings
from app.core.exceptions import AppException


class StravaClient:
    """Provide Strava OAuth and API operations."""

    authorize_url = "https://www.strava.com/oauth/authorize"
    token_url = "https://www.strava.com/oauth/token"
    api_base_url = "https://www.strava.com/api/v3"

    def __init__(self, access_token: str | None = None) -> None:
        """Create a Strava API client."""
        self.settings = get_settings()
        self.access_token = access_token

    def build_authorization_url(self, state: str, force_approval: bool = False) -> str:
        """Build the Strava OAuth authorization URL."""
        query = urlencode(
            {
                "client_id": self.settings.strava_client_id,
                "redirect_uri": self.settings.strava_redirect_uri,
                "response_type": "code",
                "approval_prompt": "force" if force_approval else "auto",
                "scope": ",".join(self.settings.strava_scope_list),
                "state": state,
            }
        )
        return f"{self.authorize_url}?{query}"

    def exchange_code_for_tokens(self, code: str) -> dict[str, Any]:
        """Exchange an OAuth authorization code for tokens."""
        with httpx.Client(timeout=20) as client:
            response = client.post(
                self.token_url,
                data={
                    "client_id": self.settings.strava_client_id,
                    "client_secret": self.settings.strava_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
        if response.status_code >= 400:
            raise AppException(400, "STRAVA_TOKEN_EXCHANGE_FAILED", "Strava token exchange failed")
        return response.json()

    def refresh_access_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh an expired Strava access token."""
        with httpx.Client(timeout=20) as client:
            response = client.post(
                self.token_url,
                data={
                    "client_id": self.settings.strava_client_id,
                    "client_secret": self.settings.strava_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code >= 400:
            raise AppException(401, "STRAVA_TOKEN_REFRESH_FAILED", "Strava token refresh failed")
        return response.json()

    def fetch_athlete(self) -> dict[str, Any]:
        """Fetch the authenticated Strava athlete."""
        return self._request("GET", "/athlete")

    def fetch_activities(
        self,
        after: datetime | None = None,
        before: datetime | None = None,
        per_page: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch Strava activities with pagination."""
        activities: list[dict[str, Any]] = []
        page = 1
        while True:
            params: dict[str, Any] = {"page": page, "per_page": per_page}
            if after is not None:
                params["after"] = int(after.timestamp())
            if before is not None:
                params["before"] = int(before.timestamp())
            batch = self._request("GET", "/athlete/activities", params=params)
            if not batch:
                break
            activities.extend(batch)
            page += 1
        return activities

    def fetch_activity_details(self, activity_id: str) -> dict[str, Any]:
        """Fetch detailed Strava activity data."""
        return self._request("GET", f"/activities/{activity_id}", params={"include_all_efforts": "false"})

    def fetch_activity_streams(self, activity_id: str) -> dict[str, Any]:
        """Fetch supported Strava streams for an activity."""
        keys = "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,moving,grade_smooth"
        return self._request(
            "GET",
            f"/activities/{activity_id}/streams",
            params={"keys": keys, "key_by_type": "true"},
        )

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None) -> Any:
        """Perform an authenticated Strava API request with light retries."""
        if not self.access_token:
            raise AppException(401, "STRAVA_NOT_CONNECTED", "Strava access token is missing")
        headers = {"Authorization": f"Bearer {self.access_token}"}
        last_response: httpx.Response | None = None
        with httpx.Client(timeout=30, headers=headers) as client:
            for attempt in range(3):
                response = client.request(method, f"{self.api_base_url}{path}", params=params)
                last_response = response
                if response.status_code in {500, 502, 503, 504}:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                break
        if last_response is None:
            raise AppException(502, "STRAVA_API_ERROR", "Strava API request failed")
        if last_response.status_code == 401:
            raise AppException(401, "STRAVA_TOKEN_REFRESH_FAILED", "Strava access token expired")
        if last_response.status_code == 403:
            raise AppException(403, "FORBIDDEN", "Strava denied access to this resource")
        if last_response.status_code == 429:
            raise AppException(429, "STRAVA_RATE_LIMITED", "Strava rate limit reached")
        if last_response.status_code >= 400:
            raise AppException(502, "STRAVA_API_ERROR", "Strava API request failed")
        _ = last_response.headers.get("X-RateLimit-Usage")
        _ = last_response.headers.get("X-RateLimit-Limit")
        return last_response.json()


def token_expiry_from_epoch(expires_at: int | None) -> datetime | None:
    """Convert a Strava epoch expiry value to UTC datetime."""
    if expires_at is None:
        return None
    return datetime.fromtimestamp(expires_at, tz=UTC)


def token_is_expired(expires_at: datetime | None) -> bool:
    """Return whether a token should be refreshed."""
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= datetime.now(UTC) + timedelta(minutes=5)
