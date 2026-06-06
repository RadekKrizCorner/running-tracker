from __future__ import annotations

from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load application settings from environment variables."""

    app_env: str = "development"
    app_name: str = "Running Tracker"
    app_base_url: str = "http://localhost:8009"
    frontend_base_url: str = "http://localhost:5173"
    secret_key: str = Field(default="replace-me", min_length=8)
    token_encryption_key: str = "replace-with-fernet-key"
    owner_email: str = "you@example.com"
    database_url: str = "postgresql+psycopg://running:running@db:5432/running_tracker"
    redis_url: str = "redis://redis:6379/0"
    strava_client_id: str = "replace-me"
    strava_client_secret: str = "replace-me"
    strava_redirect_uri: str = "http://localhost:8009/api/v1/connections/strava/callback"
    strava_scopes: str = "read,activity:read_all"
    session_cookie_name: str = "session"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    oauth_state_cookie_name: str = "strava_oauth_state"
    ai_posters_enabled: bool = False
    strava_auto_sync_enabled: bool = True
    strava_auto_sync_interval_seconds: int = 60 * 60 * 6
    demo_account_enabled: bool = False
    demo_account_email: str = "demo@example.com"
    demo_account_password: str = ""
    demo_account_display_name: str = "Portfolio Demo"
    demo_refresh_enabled: bool = False
    demo_refresh_interval_seconds: int = 60 * 60 * 24
    demo_refresh_from_owner_patterns: bool = True
    demo_refresh_history_weeks: int = 78
    routing_enabled: bool = False
    routing_provider: str = "valhalla"
    valhalla_base_url: str | None = None
    route_suggestion_max_distance_m: int = 50000
    route_suggestion_min_lat: float = 48.5
    route_suggestion_max_lat: float = 51.1
    route_suggestion_min_lng: float = 12.0
    route_suggestion_max_lng: float = 18.9

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def strava_scope_list(self) -> list[str]:
        """Return Strava scopes as a cleaned list."""
        return [scope.strip() for scope in self.strava_scopes.split(",") if scope.strip()]

    @property
    def secure_cookies(self) -> bool:
        """Return whether cookies should be marked secure."""
        return self.app_env == "production" and self.app_base_url.startswith("https://")

    @property
    def frontend_url(self) -> AnyHttpUrl | str:
        """Return the configured frontend base URL."""
        return self.frontend_base_url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
