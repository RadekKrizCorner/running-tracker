from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.core.exceptions import AppException
from app.db.session import get_session_factory
from app.models import ProviderConnection, User
from app.tests.conftest import setup_and_login


def test_strava_start_redirects_to_authorization_and_sets_state_cookie(client) -> None:
    """Verify Strava OAuth starts in the browser with a CSRF state cookie."""
    setup_and_login(client)

    response = client.get("/api/v1/connections/strava/start", follow_redirects=False)

    assert response.status_code == 307
    location = response.headers["location"]
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == "https://www.strava.com/oauth/authorize"
    assert params["client_id"] == ["client-id"]
    assert params["redirect_uri"] == ["http://testserver/api/v1/connections/strava/callback"]
    assert params["response_type"] == ["code"]
    assert params["approval_prompt"] == ["auto"]
    assert params["scope"] == ["read,activity:read_all"]
    assert params["state"] == [client.cookies.get("strava_oauth_state")]


def test_strava_start_can_force_strava_approval_prompt(client) -> None:
    """Verify Strava OAuth can force the approval screen for missing scopes."""
    setup_and_login(client)

    response = client.get("/api/v1/connections/strava/start?force=true", follow_redirects=False)

    params = parse_qs(urlparse(response.headers["location"]).query)
    assert params["approval_prompt"] == ["force"]


def test_strava_callback_exchanges_code_and_redirects_to_settings(client, monkeypatch) -> None:
    """Verify Strava callback stores encrypted tokens and returns to Settings."""
    import app.providers.strava.client as strava_client

    setup_and_login(client)
    start = client.get("/api/v1/connections/strava/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    def fake_exchange_code_for_tokens(self: strava_client.StravaClient, code: str) -> dict:
        """Return deterministic Strava token payload."""
        _ = self
        assert code == "auth-code"
        return {
            "access_token": "secret-access-token",
            "refresh_token": "secret-refresh-token",
            "expires_at": 1_800_000_000,
            "scope": "read,activity:read_all",
            "athlete": {"id": 12345},
        }

    monkeypatch.setattr(strava_client.StravaClient, "exchange_code_for_tokens", fake_exchange_code_for_tokens)

    response = client.get(
        f"/api/v1/connections/strava/callback?code=auth-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://frontend.test/settings/connections?strava=connected"
    assert client.cookies.get("strava_oauth_state") is None
    with get_session_factory()() as session:
        owner = session.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner is not None
        connection = session.scalar(
            select(ProviderConnection).where(
                ProviderConnection.user_id == owner.id,
                ProviderConnection.provider == "strava",
            )
        )
        assert connection is not None
        assert connection.status == "connected"
        assert connection.provider_user_id == "12345"
        assert connection.access_token_encrypted != "secret-access-token"
        assert connection.refresh_token_encrypted != "secret-refresh-token"


def test_strava_callback_denied_redirects_to_settings_and_clears_state(client) -> None:
    """Verify denied Strava access returns a user-readable Settings result."""
    setup_and_login(client)
    start = client.get("/api/v1/connections/strava/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    response = client.get(
        f"/api/v1/connections/strava/callback?error=access_denied&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://frontend.test/settings/connections?strava=denied"
    assert client.cookies.get("strava_oauth_state") is None


def test_strava_callback_denied_with_invalid_state_redirects_to_invalid_state(client) -> None:
    """Verify denied Strava access still validates the OAuth state."""
    setup_and_login(client)
    client.get("/api/v1/connections/strava/start", follow_redirects=False)

    response = client.get(
        "/api/v1/connections/strava/callback?error=access_denied&state=wrong-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://frontend.test/settings/connections?strava=invalid_state"
    assert client.cookies.get("strava_oauth_state") is None


def test_strava_callback_invalid_state_redirects_to_settings_and_clears_state(client) -> None:
    """Verify invalid OAuth state redirects to Settings instead of raw JSON errors."""
    setup_and_login(client)
    client.get("/api/v1/connections/strava/start", follow_redirects=False)

    response = client.get(
        "/api/v1/connections/strava/callback?code=auth-code&state=wrong-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://frontend.test/settings/connections?strava=invalid_state"
    assert client.cookies.get("strava_oauth_state") is None


def test_strava_callback_token_exchange_failure_redirects_to_settings(client, monkeypatch) -> None:
    """Verify token exchange failure returns to Settings with a retryable result."""
    import app.providers.strava.client as strava_client

    setup_and_login(client)
    start = client.get("/api/v1/connections/strava/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    def fake_exchange_code_for_tokens(self: strava_client.StravaClient, code: str) -> dict:
        """Raise a deterministic token exchange failure."""
        _ = self
        assert code == "auth-code"
        raise AppException(400, "STRAVA_TOKEN_EXCHANGE_FAILED", "Strava token exchange failed")

    monkeypatch.setattr(strava_client.StravaClient, "exchange_code_for_tokens", fake_exchange_code_for_tokens)

    response = client.get(
        f"/api/v1/connections/strava/callback?code=auth-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://frontend.test/settings/connections?strava=error"
    assert client.cookies.get("strava_oauth_state") is None
