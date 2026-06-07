from __future__ import annotations

import pytest

from app.core.config import Settings, validate_runtime_settings


def test_development_settings_allow_local_placeholders() -> None:
    """Verify development settings keep local placeholder convenience."""
    settings = Settings(app_env="development")

    validate_runtime_settings(settings)


def test_production_settings_reject_placeholder_secrets() -> None:
    """Verify production settings reject unsafe placeholder values."""
    settings = Settings(
        app_env="production",
        app_base_url="https://example.com",
        frontend_base_url="https://example.com",
        secret_key="replace-me",
        token_encryption_key="replace-with-fernet-key",
        owner_email="you@example.com",
        strava_client_id="replace-me",
        strava_client_secret="replace-me",
    )

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_runtime_settings(settings)


def test_production_settings_accept_real_required_values() -> None:
    """Verify production settings accept non-placeholder runtime values."""
    settings = Settings(
        app_env="production",
        app_base_url="https://example.com",
        frontend_base_url="https://example.com",
        secret_key="test-production-secret-key-with-more-than-32-characters",
        token_encryption_key="4RI7HbCS8X1exbEKeJ9UCEWvhIHg3vlbbCfKKvr1lhY=",
        owner_email="runner@example.com",
        strava_client_id="12345",
        strava_client_secret="real-strava-client-secret",
        strava_redirect_uri="https://example.com/api/v1/connections/strava/callback",
    )

    validate_runtime_settings(settings)
