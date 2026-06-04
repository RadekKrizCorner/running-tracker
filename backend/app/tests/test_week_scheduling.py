from __future__ import annotations

from uuid import uuid4

from app.tests.conftest import setup_and_login


def test_workout_templates_include_defaults_and_custom_templates(client) -> None:
    """Verify templates include reusable defaults and owner-created templates."""
    setup_and_login(client)

    defaults = client.get("/api/v1/workout-templates")

    assert defaults.status_code == 200
    default_names = {template["name"] for template in defaults.json()}
    assert {"Easy run", "Long run", "Rest"}.issubset(default_names)

    created = client.post(
        "/api/v1/workout-templates",
        json={
            "name": "Hill loop",
            "workout_type": "hills",
            "title": "Hill loop",
            "target_duration_s": 2700,
            "target_distance_m": 7000,
            "target_intensity": "hard",
            "instructions": "Warm up, run short hills controlled, cool down.",
        },
    )

    assert created.status_code == 200
    assert created.json()["name"] == "Hill loop"
    assert created.json()["workout_type"] == "hills"


def test_week_schedule_replaces_week_from_templates_and_custom_entries(client) -> None:
    """Verify owner can replace a whole week with template and custom workouts."""
    setup_and_login(client)
    templates = client.get("/api/v1/workout-templates").json()
    easy_template = next(template for template in templates if template["name"] == "Easy run")
    rest_template = next(template for template in templates if template["name"] == "Rest")

    first_save = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-04",
            "workouts": [
                {"scheduled_date": "2026-05-04", "template_id": easy_template["id"]},
                {
                    "scheduled_date": "2026-05-06",
                    "title": "Controlled tempo",
                    "workout_type": "tempo",
                    "target_duration_s": 3000,
                    "target_distance_m": 8000,
                    "target_intensity": "hard",
                    "instructions": "Keep the hard work controlled.",
                },
            ],
        },
    )

    assert first_save.status_code == 200
    assert [workout["title"] for workout in first_save.json()["planned_workouts"]] == [
        "Easy run",
        "Controlled tempo",
    ]

    second_save = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-04",
            "workouts": [{"scheduled_date": "2026-05-05", "template_id": rest_template["id"]}],
        },
    )

    assert second_save.status_code == 200
    assert [(workout["scheduled_date"], workout["title"]) for workout in second_save.json()["planned_workouts"]] == [
        ("2026-05-05", "Rest")
    ]

    calendar = client.get("/api/v1/calendar?start_date=2026-05-04&end_date=2026-05-10")
    assert calendar.status_code == 200
    assert [(workout["scheduled_date"], workout["title"]) for workout in calendar.json()["planned_workouts"]] == [
        ("2026-05-05", "Rest")
    ]


def test_week_schedule_keeps_one_workout_per_day(client) -> None:
    """Verify saving a week keeps the last submitted workout for each day."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-18",
            "workouts": [
                {
                    "scheduled_date": "2026-05-18",
                    "title": "Old duplicate",
                    "workout_type": "easy",
                    "target_duration_s": 1800,
                    "target_distance_m": 5000,
                    "target_intensity": "easy",
                },
                {
                    "scheduled_date": "2026-05-18",
                    "title": "Easy run",
                    "workout_type": "easy",
                    "target_duration_s": 2700,
                    "target_distance_m": 7000,
                    "target_intensity": "easy",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert [(workout["scheduled_date"], workout["title"]) for workout in response.json()["planned_workouts"]] == [
        ("2026-05-18", "Easy run")
    ]

    calendar = client.get("/api/v1/calendar?start_date=2026-05-18&end_date=2026-05-24")
    assert calendar.status_code == 200
    assert [(workout["scheduled_date"], workout["title"]) for workout in calendar.json()["planned_workouts"]] == [
        ("2026-05-18", "Easy run")
    ]


def test_week_schedule_allows_multiple_sessions_on_one_day(client) -> None:
    """Verify saving a week can keep multiple ordered sessions on one day."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-18",
            "workouts": [
                {
                    "scheduled_date": "2026-05-18",
                    "session_label": "Ráno",
                    "sort_order": 0,
                    "title": "Threshold intervaly",
                    "workout_type": "tempo",
                    "target_duration_s": 2700,
                    "target_intensity": "hard",
                },
                {
                    "scheduled_date": "2026-05-18",
                    "session_label": "Odpoledne",
                    "sort_order": 1,
                    "title": "Threshold tempo",
                    "workout_type": "tempo",
                    "target_duration_s": 2700,
                    "target_intensity": "hard",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert [(workout["session_label"], workout["sort_order"], workout["title"]) for workout in response.json()["planned_workouts"]] == [
        ("Ráno", 0, "Threshold intervaly"),
        ("Odpoledne", 1, "Threshold tempo"),
    ]

    calendar = client.get("/api/v1/calendar?start_date=2026-05-18&end_date=2026-05-24")
    assert calendar.status_code == 200
    assert [(workout["session_label"], workout["sort_order"], workout["title"]) for workout in calendar.json()["planned_workouts"]] == [
        ("Ráno", 0, "Threshold intervaly"),
        ("Odpoledne", 1, "Threshold tempo"),
    ]


def test_week_schedule_rejects_rest_mixed_with_workout_sessions(client) -> None:
    """Verify a rest day cannot coexist with planned workout sessions."""
    setup_and_login(client)

    response = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-18",
            "workouts": [
                {
                    "scheduled_date": "2026-05-18",
                    "title": "Rest",
                    "workout_type": "rest",
                    "target_intensity": "rest",
                },
                {
                    "scheduled_date": "2026-05-18",
                    "session_label": "Ráno",
                    "title": "Easy run",
                    "workout_type": "easy",
                    "target_duration_s": 2700,
                    "target_intensity": "easy",
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == "REST_DAY_CONFLICT"


def test_week_schedule_creates_manual_training_plan(client) -> None:
    """Verify saving a week creates a manual plan and links workouts to it."""
    setup_and_login(client)
    templates = client.get("/api/v1/workout-templates").json()
    easy_template = next(template for template in templates if template["name"] == "Easy run")

    response = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-11",
            "plan_title": "Base week before 10K",
            "workouts": [
                {"scheduled_date": "2026-05-11", "template_id": easy_template["id"]},
                {"scheduled_date": "2026-05-14", "template_id": easy_template["id"]},
            ],
        },
    )

    assert response.status_code == 200
    plan_ids = {workout["plan_id"] for workout in response.json()["planned_workouts"]}
    assert len(plan_ids) == 1
    assert None not in plan_ids

    plans = client.get("/api/v1/plans")
    assert plans.status_code == 200
    saved_plan = next(plan for plan in plans.json() if plan["title"] == "Base week before 10K")
    assert saved_plan["goal_type"] == "manual_week"
    assert saved_plan["start_date"] == "2026-05-11"
    assert saved_plan["end_date"] == "2026-05-17"

    calendar = client.get("/api/v1/calendar?start_date=2026-05-11&end_date=2026-05-17")
    assert calendar.status_code == 200
    assert calendar.json()["plan"]["title"] == "Base week before 10K"


def test_week_copy_endpoint_copies_source_week_to_target_week(client) -> None:
    """Verify owner can copy one manual week into another week."""
    setup_and_login(client)
    source = client.post(
        "/api/v1/calendar/week",
        json={
            "week_start_date": "2026-05-04",
            "plan_title": "Source week",
            "workouts": [
                {
                    "scheduled_date": "2026-05-05",
                    "title": "Source easy",
                    "workout_type": "easy",
                    "target_duration_s": 2700,
                    "target_distance_m": 7000,
                    "target_intensity": "easy",
                    "instructions": "Keep it relaxed.",
                },
                {
                    "scheduled_date": "2026-05-08",
                    "title": "Source tempo",
                    "workout_type": "tempo",
                    "target_duration_s": 3000,
                    "target_distance_m": 8000,
                    "target_intensity": "hard",
                    "instructions": "Controlled effort.",
                },
            ],
        },
    )
    assert source.status_code == 200

    copied = client.post(
        "/api/v1/calendar/week/copy",
        json={
            "source_week_start_date": "2026-05-04",
            "target_week_start_date": "2026-05-11",
            "plan_title": "Copied week",
        },
    )

    assert copied.status_code == 200
    workouts = copied.json()["planned_workouts"]
    assert [(workout["scheduled_date"], workout["title"]) for workout in workouts] == [
        ("2026-05-12", "Source easy"),
        ("2026-05-15", "Source tempo"),
    ]
    assert copied.json()["plan"]["title"] == "Copied week"


def test_workout_pool_items_can_be_scheduled_and_removed(client) -> None:
    """Verify unscheduled workout pool supports creating, scheduling, and deleting items."""
    setup_and_login(client)

    created = client.post(
        "/api/v1/workout-pool",
        json={
            "title": "Pool easy run",
            "workout_type": "easy",
            "target_duration_s": 2400,
            "target_distance_m": 6000,
            "target_intensity": "easy",
            "instructions": "Use whenever there is space.",
        },
    )

    assert created.status_code == 200
    pool_item_id = created.json()["id"]
    assert created.json()["title"] == "Pool easy run"

    scheduled = client.post(
        f"/api/v1/workout-pool/{pool_item_id}/schedule",
        json={"scheduled_date": "2026-05-13"},
    )

    assert scheduled.status_code == 200
    assert scheduled.json()["scheduled_date"] == "2026-05-13"
    assert scheduled.json()["title"] == "Pool easy run"

    pool = client.get("/api/v1/workout-pool")
    assert pool.status_code == 200
    assert pool.json() == []

    created_again = client.post(
        "/api/v1/workout-pool",
        json={"title": "Delete me", "workout_type": "recovery", "target_intensity": "easy"},
    )
    assert created_again.status_code == 200
    deleted = client.delete(f"/api/v1/workout-pool/{created_again.json()['id']}")
    assert deleted.status_code == 204


def test_planned_workout_create_validates_owner_scoped_references(client) -> None:
    """Verify direct planned workout creation rejects missing owner references."""
    setup_and_login(client)

    missing_plan = client.post(
        "/api/v1/planned-workouts",
        json={
            "plan_id": str(uuid4()),
            "scheduled_date": "2026-05-13",
            "title": "Invalid plan",
            "workout_type": "easy",
        },
    )

    assert missing_plan.status_code == 404
    assert missing_plan.json()["code"] == "PLAN_NOT_FOUND"

    missing_activity = client.post(
        "/api/v1/planned-workouts",
        json={
            "completed_activity_id": str(uuid4()),
            "scheduled_date": "2026-05-13",
            "title": "Invalid activity",
            "workout_type": "easy",
        },
    )

    assert missing_activity.status_code == 404
    assert missing_activity.json()["code"] == "ACTIVITY_NOT_FOUND"


def test_planned_workout_update_can_clear_optional_fields(client) -> None:
    """Verify direct planned workout updates can clear optional fields explicitly."""
    setup_and_login(client)
    created = client.post(
        "/api/v1/planned-workouts",
        json={
            "scheduled_date": "2026-05-13",
            "title": "Easy run",
            "workout_type": "easy",
            "target_distance_m": 7000,
            "instructions": "Keep it relaxed.",
        },
    )
    assert created.status_code == 200

    updated = client.patch(
        f"/api/v1/planned-workouts/{created.json()['id']}",
        json={"target_distance_m": None, "instructions": None},
    )

    assert updated.status_code == 200
    assert updated.json()["target_distance_m"] is None
    assert updated.json()["instructions"] is None

    missing_activity = client.patch(
        f"/api/v1/planned-workouts/{created.json()['id']}",
        json={"completed_activity_id": str(uuid4())},
    )

    assert missing_activity.status_code == 404
    assert missing_activity.json()["code"] == "ACTIVITY_NOT_FOUND"
