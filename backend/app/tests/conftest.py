from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    """Create an isolated API client backed by a temporary database."""
    db_path = tmp_path / "running_tracker_test.db"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APP_NAME", "Running Tracker Test")
    monkeypatch.setenv("APP_BASE_URL", "http://testserver")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://frontend.test")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-with-enough-length")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "4RI7HbCS8X1exbEKeJ9UCEWvhIHg3vlbbCfKKvr1lhY=")
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/15")
    monkeypatch.setenv("STRAVA_CLIENT_ID", "client-id")
    monkeypatch.setenv("STRAVA_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv(
        "STRAVA_REDIRECT_URI",
        "http://testserver/api/v1/connections/strava/callback",
    )
    monkeypatch.setenv("STRAVA_SCOPES", "read,activity:read_all")

    from app.core.config import get_settings
    from app.db.session import reset_engine_for_tests
    from app.main import create_app

    get_settings.cache_clear()
    reset_engine_for_tests()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def setup_and_login(client: TestClient) -> None:
    """Create the owner password and log in the test client."""
    response = client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert response.status_code == 200
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert login.status_code == 200
