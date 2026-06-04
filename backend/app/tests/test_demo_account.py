from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings


def test_demo_login_is_disabled_by_default(client: TestClient) -> None:
    """Verify demo login is unavailable unless explicitly enabled."""
    response = client.post("/api/v1/auth/demo-login")

    assert response.status_code == 404
    assert response.json()["code"] == "DEMO_ACCOUNT_DISABLED"


def test_demo_login_returns_demo_user_when_enabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify enabled demo login creates a demo session."""
    _enable_demo_account(monkeypatch)

    response = client.post("/api/v1/auth/demo-login")

    assert response.status_code == 200
    assert response.json()["email"] == "demo@example.com"
    assert response.json()["display_name"] == "Portfolio Demo"
    assert response.json()["is_demo"] is True
    assert "session" in response.cookies

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["is_demo"] is True


def test_owner_me_response_marks_owner_as_not_demo(client: TestClient) -> None:
    """Verify normal owner sessions expose a non-demo flag."""
    setup = client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert setup.status_code == 200

    me = client.get("/api/v1/auth/me")

    assert me.status_code == 200
    assert me.json()["is_demo"] is False


def test_demo_user_cannot_change_password(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo sessions cannot change passwords."""
    _login_demo(client, monkeypatch)

    response = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "demo password", "new_password": "another secure password"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "DEMO_READ_ONLY"


def test_demo_user_cannot_start_strava_oauth(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo sessions cannot start Strava OAuth."""
    _login_demo(client, monkeypatch)

    response = client.get("/api/v1/connections/strava/start", follow_redirects=False)

    assert response.status_code == 403
    assert response.json()["code"] == "DEMO_READ_ONLY"


def test_demo_user_cannot_export_data(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify demo sessions cannot export demo data."""
    _login_demo(client, monkeypatch)

    response = client.get("/api/v1/export/data")

    assert response.status_code == 403
    assert response.json()["code"] == "DEMO_READ_ONLY"


def _login_demo(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Log the test client into the enabled demo account."""
    _enable_demo_account(monkeypatch)
    response = client.post("/api/v1/auth/demo-login")
    assert response.status_code == 200


def _enable_demo_account(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enable demo account settings for one test."""
    monkeypatch.setenv("DEMO_ACCOUNT_ENABLED", "true")
    monkeypatch.setenv("DEMO_ACCOUNT_EMAIL", "demo@example.com")
    monkeypatch.setenv("DEMO_ACCOUNT_PASSWORD", "demo password")
    monkeypatch.setenv("DEMO_ACCOUNT_DISPLAY_NAME", "Portfolio Demo")
    get_settings.cache_clear()
