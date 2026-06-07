from __future__ import annotations

from fastapi.testclient import TestClient


def test_owner_setup_login_me_and_logout(client: TestClient) -> None:
    """Verify the owner can set a password, log in, read self, and log out."""
    unauthenticated = client.get("/api/v1/auth/me")
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["code"] == "UNAUTHENTICATED"

    setup = client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert setup.status_code == 200
    assert setup.json()["email"] == "owner@example.com"

    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "wrong-password"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["code"] == "UNAUTHENTICATED"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert login.status_code == 200
    assert "session" in login.cookies

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_owner_setup_cannot_replace_existing_password(client: TestClient) -> None:
    """Verify owner setup is blocked after a password already exists."""
    first = client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "new password is ignored"},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "OWNER_ALREADY_CONFIGURED"


def test_change_password_requires_current_password(client: TestClient) -> None:
    """Verify password changes require the current password."""
    client.post(
        "/api/v1/auth/setup-owner",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )

    denied = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "new secure password"},
    )
    assert denied.status_code == 401

    changed = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "correct horse battery staple",
            "new_password": "new secure password",
        },
    )
    assert changed.status_code == 204

    client.post("/api/v1/auth/logout")
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "new secure password"},
    )
    assert new_login.status_code == 200


def test_validation_errors_do_not_echo_rejected_inputs(client: TestClient) -> None:
    """Verify validation errors do not return submitted input values."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": ""},
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "VALIDATION_ERROR"
    assert "not-an-email" not in str(payload)
    assert all("input" not in error for error in payload["errors"])
