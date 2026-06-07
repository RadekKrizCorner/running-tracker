from __future__ import annotations

from app.tests.conftest import setup_and_login


def test_owner_preferences_can_be_read_and_updated(client) -> None:
    """Verify owner UI preferences are persisted server-side."""
    setup_and_login(client)

    initial = client.get("/api/v1/profile/preferences")

    assert initial.status_code == 200
    assert initial.json()["locale"] == "cs-CZ"
    assert initial.json()["dashboard_mode"] == "advanced"
    assert initial.json()["favorite_template_ids"] == []
    assert initial.json()["route_start_lat"] is None
    assert initial.json()["route_start_lng"] is None
    assert initial.json()["route_start_label"] is None

    response = client.patch(
        "/api/v1/profile/preferences",
        json={
            "dashboard_mode": "simple",
            "favorite_template_ids": ["template-a"],
            "recent_template_ids": ["template-b", "template-a"],
            "route_start_lat": 49.2893614,
            "route_start_lng": 16.0977864,
            "route_start_label": "Tasov",
            "pace_zones": [
                {"name": "Easy", "min_pace_s_per_km": 360, "max_pace_s_per_km": 420},
                {"name": "Tempo", "min_pace_s_per_km": 300, "max_pace_s_per_km": 359},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dashboard_mode"] == "simple"
    assert body["favorite_template_ids"] == ["template-a"]
    assert body["recent_template_ids"] == ["template-b", "template-a"]
    assert body["route_start_lat"] == 49.2893614
    assert body["route_start_lng"] == 16.0977864
    assert body["route_start_label"] == "Tasov"
    assert body["pace_zones"][0]["name"] == "Easy"

    persisted = client.get("/api/v1/profile/preferences")
    assert persisted.status_code == 200
    assert persisted.json()["dashboard_mode"] == "simple"
    assert persisted.json()["route_start_lat"] == 49.2893614
    assert persisted.json()["route_start_lng"] == 16.0977864


def test_owner_preferences_persist_avatar_choice(client) -> None:
    """Verify owner avatar icon and uploaded image choices are persisted."""
    setup_and_login(client)

    icon_response = client.patch(
        "/api/v1/profile/preferences",
        json={"avatar_icon": "runner_route", "avatar_image_data_url": None},
    )

    assert icon_response.status_code == 200
    assert icon_response.json()["avatar_icon"] == "runner_route"
    assert icon_response.json()["avatar_image_data_url"] is None

    image_data_url = "data:image/png;base64,aWNvbg=="
    image_response = client.patch(
        "/api/v1/profile/preferences",
        json={"avatar_icon": None, "avatar_image_data_url": image_data_url},
    )

    assert image_response.status_code == 200
    assert image_response.json()["avatar_icon"] is None
    assert image_response.json()["avatar_image_data_url"] == image_data_url

    persisted = client.get("/api/v1/profile/preferences")
    assert persisted.status_code == 200
    assert persisted.json()["avatar_icon"] is None
    assert persisted.json()["avatar_image_data_url"] == image_data_url


def test_owner_preferences_reject_invalid_avatar_inputs(client) -> None:
    """Verify avatar preferences only accept known icons and image data URLs."""
    setup_and_login(client)

    invalid_icon = client.patch("/api/v1/profile/preferences", json={"avatar_icon": "not-real"})
    invalid_image = client.patch("/api/v1/profile/preferences", json={"avatar_image_data_url": "https://example.test/avatar.png"})

    assert invalid_icon.status_code == 422
    assert invalid_image.status_code == 422
