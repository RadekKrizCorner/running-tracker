from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.intensity import classify_intensity
from app.analytics.load import calculate_training_load
from app.core.config import Settings
from app.core.time import week_start
from app.models import (
    Activity,
    ActivityNote,
    ActivityStream,
    CalendarEvent,
    Event,
    Gear,
    HeartRateZoneSet,
    Notification,
    PlannedWorkout,
    TrainingPlan,
    User,
    UserPreference,
    WeeklyMetric,
    WorkoutPoolItem,
    WorkoutTemplate,
)
from app.services.analytics_service import recompute_owner_weekly_metrics
from app.services.auth_service import ensure_demo_account

HR_ZONES = [(95, 120), (121, 140), (141, 158), (159, 176), (177, 196)]
HR_ZONE_PAYLOAD = [
    {"name": "Z1", "min_hr": 95, "max_hr": 120},
    {"name": "Z2", "min_hr": 121, "max_hr": 140},
    {"name": "Z3", "min_hr": 141, "max_hr": 158},
    {"name": "Z4", "min_hr": 159, "max_hr": 176},
    {"name": "Z5", "min_hr": 177, "max_hr": 196},
]


@dataclass(frozen=True)
class DemoRefreshResult:
    """Represent generated demo data counts."""

    activities: int
    streams: int
    planned_workouts: int
    events: int
    gear: int
    start_date: date
    end_date: date


@dataclass(frozen=True)
class DemoPatterns:
    """Represent safe aggregate training patterns for demo generation."""

    weekly_runs: int
    easy_distance_m: int
    long_distance_m: int
    easy_pace_s_per_km: int


@dataclass(frozen=True)
class RouteCluster:
    """Represent one public city route cluster."""

    city: str
    area: str
    center_lat: float
    center_lng: float
    route_label: str


ROUTE_CLUSTERS = [
    RouteCluster("Prague", "Vltava", 50.0874, 14.4148, "Prague river"),
    RouteCluster("London", "Hyde Park", 51.5073, -0.1657, "Hyde Park"),
    RouteCluster("Paris", "Seine", 48.8584, 2.2945, "Paris river"),
    RouteCluster("Berlin", "Tiergarten", 52.5145, 13.3501, "Tiergarten"),
    RouteCluster("Vienna", "Prater", 48.2167, 16.3972, "Prater"),
]


def refresh_demo_account(
    session: Session,
    settings: Settings,
    *,
    today: date | None = None,
    history_weeks: int | None = None,
    from_owner_patterns: bool | None = None,
) -> DemoRefreshResult:
    """Refresh the configured demo account with rolling generated data."""
    current_date = today or date.today()
    weeks = max(4, min(history_weeks or settings.demo_refresh_history_weeks, 78))
    use_owner_patterns = settings.demo_refresh_from_owner_patterns if from_owner_patterns is None else from_owner_patterns
    patterns = learn_owner_patterns(session) if use_owner_patterns else default_demo_patterns()
    demo_user = ensure_demo_account(session, settings)
    clear_demo_records(session, demo_user.id)
    gear = _create_demo_gear(session, demo_user, current_date)
    _create_demo_preferences(session, demo_user, current_date)
    _create_demo_events(session, demo_user, current_date)
    activity_count, stream_count = _create_demo_activities(session, demo_user, gear, patterns, current_date, weeks)
    planned_count = _create_demo_plans(session, demo_user, patterns, current_date)
    session.commit()
    recompute_owner_weekly_metrics(session, demo_user.id)
    return DemoRefreshResult(
        activities=activity_count,
        streams=stream_count,
        planned_workouts=planned_count,
        events=2,
        gear=len(gear),
        start_date=current_date - timedelta(weeks=weeks),
        end_date=current_date,
    )


def learn_owner_patterns(session: Session) -> DemoPatterns:
    """Return safe aggregate owner patterns or synthetic defaults."""
    owner = session.scalar(select(User).where(User.is_demo.is_(False)).order_by(User.created_at).limit(1))
    if owner is None:
        return default_demo_patterns()
    activities = list(
        session.scalars(
            select(Activity)
            .where(Activity.user_id == owner.id, Activity.sport_type == "Run", Activity.distance_m.is_not(None))
            .order_by(Activity.start_time_utc.desc())
            .limit(160)
        )
    )
    if len(activities) < 8:
        return default_demo_patterns()

    distances = [float(activity.distance_m or 0) for activity in activities if activity.distance_m]
    moving = [activity.moving_time_s or 0 for activity in activities if activity.moving_time_s]
    if not distances or not moving:
        return default_demo_patterns()

    weekly_counts: dict[date, int] = {}
    for activity in activities:
        weekly_counts.setdefault(week_start(activity.start_time_utc.date()), 0)
        weekly_counts[week_start(activity.start_time_utc.date())] += 1
    weekly_runs = round(sum(weekly_counts.values()) / max(len(weekly_counts), 1))
    average_distance = sum(distances) / len(distances)
    average_pace = sum(moving) / max(sum(distance / 1000 for distance in distances), 1)
    return DemoPatterns(
        weekly_runs=max(3, min(5, weekly_runs)),
        easy_distance_m=max(5000, min(9000, int(round(average_distance / 500)) * 500)),
        long_distance_m=max(12000, min(24000, int(round((average_distance * 1.9) / 500)) * 500)),
        easy_pace_s_per_km=max(300, min(420, int(round(average_pace / 5)) * 5)),
    )


def default_demo_patterns() -> DemoPatterns:
    """Return synthetic fallback patterns for demo generation."""
    return DemoPatterns(weekly_runs=4, easy_distance_m=7200, long_distance_m=16500, easy_pace_s_per_km=335)


def clear_demo_records(session: Session, demo_user_id: UUID) -> None:
    """Delete generated records for one demo account."""
    activities = list(session.scalars(select(Activity).where(Activity.user_id == demo_user_id)))
    for activity in activities:
        activity.gear.clear()
        session.delete(activity)
    for model in (
        CalendarEvent,
        Event,
        Gear,
        HeartRateZoneSet,
        Notification,
        PlannedWorkout,
        TrainingPlan,
        UserPreference,
        WeeklyMetric,
        WorkoutPoolItem,
        WorkoutTemplate,
    ):
        for item in session.scalars(select(model).where(model.user_id == demo_user_id)):
            session.delete(item)
    session.flush()


def _create_demo_gear(session: Session, demo_user: User, today: date) -> list[Gear]:
    """Create demo shoes for generated activities."""
    shoes = [
        Gear(
            user_id=demo_user.id,
            name="Daily Trainer",
            brand="Demo",
            model="Cruise 3",
            start_date=today - timedelta(days=260),
            retirement_distance_m=Decimal("700000"),
            notes="Reliable daily mileage shoe for the generated demo account.",
        ),
        Gear(
            user_id=demo_user.id,
            name="Tempo Shoe",
            brand="Demo",
            model="Swift 2",
            start_date=today - timedelta(days=120),
            retirement_distance_m=Decimal("500000"),
            notes="Used for workouts and race-specific sessions.",
        ),
        Gear(
            user_id=demo_user.id,
            name="Trail Shoe",
            brand="Demo",
            model="Ridge",
            start_date=today - timedelta(days=180),
            retirement_distance_m=Decimal("650000"),
            notes="Used for synthetic hill and park routes.",
        ),
    ]
    session.add_all(shoes)
    session.flush()
    return shoes


def _create_demo_preferences(session: Session, demo_user: User, today: date) -> None:
    """Create demo preferences and heart-rate zones."""
    session.add(
        UserPreference(
            user_id=demo_user.id,
            locale="en-US",
            dashboard_mode="advanced",
            avatar_icon="runner_route",
            pace_zones=[
                {"name": "Easy", "min_pace_s_per_km": 315, "max_pace_s_per_km": 390},
                {"name": "Steady", "min_pace_s_per_km": 285, "max_pace_s_per_km": 314},
                {"name": "Fast", "min_pace_s_per_km": 230, "max_pace_s_per_km": 284},
            ],
        )
    )
    session.add(
        HeartRateZoneSet(
            user_id=demo_user.id,
            name="Demo zones",
            effective_from=today - timedelta(days=520),
            zones=HR_ZONE_PAYLOAD,
        )
    )


def _create_demo_events(session: Session, demo_user: User, today: date) -> None:
    """Create fictional upcoming race events."""
    events = [
        Event(
            user_id=demo_user.id,
            name="Prague Spring 10K",
            event_date=today + timedelta(days=38),
            location="Prague, Czech Republic",
            event_type="race",
            distance_m=Decimal("10000"),
            elevation_gain_m=Decimal("80"),
            surface="road",
            priority="A",
            target_time_s=2700,
            goal_notes="Run even splits and keep the first half controlled.",
            course_notes="Flat city course with a few bridge crossings.",
            fueling_notes="Light breakfast and water before the start.",
            gear_notes="Tempo Shoe",
            travel_notes="Arrive early and use public transport.",
        ),
        Event(
            user_id=demo_user.id,
            name="Vienna City Half",
            event_date=today + timedelta(days=82),
            location="Vienna, Austria",
            event_type="race",
            distance_m=Decimal("21097"),
            elevation_gain_m=Decimal("130"),
            surface="road",
            priority="B",
            target_time_s=6300,
            goal_notes="Use the event as a controlled endurance benchmark.",
        ),
    ]
    session.add_all(events)


def _create_demo_activities(
    session: Session,
    demo_user: User,
    gear: list[Gear],
    patterns: DemoPatterns,
    today: date,
    history_weeks: int,
) -> tuple[int, int]:
    """Create generated completed activities and streams."""
    rng = random.Random(f"demo-{today.isoformat()}-{history_weeks}")
    start_week = week_start(today) - timedelta(weeks=history_weeks - 1)
    activity_count = 0
    stream_count = 0
    for week_index in range(history_weeks):
        current_week = start_week + timedelta(weeks=week_index)
        days = _run_days_for_week(patterns.weekly_runs, week_index)
        cutback_factor = 0.82 if week_index % 4 == 3 else 1.0
        for run_index, day_offset in enumerate(days):
            run_date = current_week + timedelta(days=day_offset)
            if run_date > today:
                continue
            activity = _build_activity(
                demo_user,
                gear,
                patterns,
                rng,
                run_date,
                week_index,
                run_index,
                cutback_factor,
            )
            session.add(activity)
            session.flush()
            streams = _streams_for_activity(activity, rng)
            session.add_all(streams)
            if activity_count % 5 == 0:
                session.add(
                    ActivityNote(
                        activity_id=activity.id,
                        user_id=demo_user.id,
                        rpe=int(activity.perceived_effort or 4),
                        fatigue=3 + (activity_count % 3),
                        soreness=2 + (activity_count % 2),
                        pain_flag=False,
                        sleep_quality=4,
                        notes="Felt controlled and matched the planned effort.",
                    )
                )
            activity_count += 1
            stream_count += len(streams)
    return activity_count, stream_count


def _build_activity(
    demo_user: User,
    gear: list[Gear],
    patterns: DemoPatterns,
    rng: random.Random,
    run_date: date,
    week_index: int,
    run_index: int,
    cutback_factor: float,
) -> Activity:
    """Create one generated activity model."""
    workout_type = _workout_type(run_index)
    distance_m = _distance_for_workout(patterns, workout_type, rng, cutback_factor)
    pace_s_per_km = _pace_for_workout(patterns, workout_type, rng)
    moving_time_s = int(round((distance_m / 1000) * pace_s_per_km))
    heartrate = _heartrate_for_workout(workout_type, moving_time_s)
    rpe = _rpe_for_workout(workout_type)
    load = calculate_training_load(moving_time_s, heartrate, HR_ZONES, rpe)
    cluster = ROUTE_CLUSTERS[(week_index + run_index) % len(ROUTE_CLUSTERS)]
    start_time = datetime.combine(run_date, time(hour=6 + run_index, minute=15), tzinfo=UTC)
    activity = Activity(
        user_id=demo_user.id,
        provider="demo",
        provider_activity_id=f"demo-{run_date.isoformat()}-{run_index}",
        sport_type="Run",
        workout_type=workout_type,
        name=f"{cluster.route_label} {_activity_title(workout_type)}",
        description="Generated portfolio demo activity.",
        start_time_utc=start_time,
        start_time_local=start_time.replace(tzinfo=None) + timedelta(hours=2),
        timezone=demo_user.timezone,
        distance_m=Decimal(str(distance_m)),
        moving_time_s=moving_time_s,
        elapsed_time_s=moving_time_s + 90 + run_index * 20,
        elevation_gain_m=Decimal(str(_elevation_for_workout(distance_m, workout_type, rng))),
        average_speed_mps=Decimal(str(round(distance_m / moving_time_s, 3))),
        max_speed_mps=Decimal(str(round((distance_m / moving_time_s) * 1.25, 3))),
        average_hr=Decimal(str(round(sum(heartrate) / len(heartrate), 1))),
        max_hr=Decimal(str(max(heartrate))),
        average_cadence=Decimal(str(166 + run_index * 2)),
        calories=Decimal(str(round(distance_m * 0.075))),
        perceived_effort=Decimal(str(rpe)),
        computed_load=Decimal(str(load.load)),
        load_source=load.source,
        intensity_class=classify_intensity(moving_time_s, heartrate, HR_ZONES, rpe, workout_type),
        elevation_gain_source="demo",
        source_payload={"generated": True, "city": cluster.city, "area": cluster.area},
    )
    activity.gear.append(_gear_for_workout(gear, workout_type))
    return activity


def _streams_for_activity(activity: Activity, rng: random.Random) -> list[ActivityStream]:
    """Create stream rows for one generated activity."""
    sample_count = 64
    moving_time_s = activity.moving_time_s or sample_count
    distance_m = float(activity.distance_m or 0)
    cluster_name = str((activity.source_payload or {}).get("city", "Prague"))
    cluster = next((item for item in ROUTE_CLUSTERS if item.city == cluster_name), ROUTE_CLUSTERS[0])
    time_values = [round(index * moving_time_s / (sample_count - 1)) for index in range(sample_count)]
    distance_values = [round(index * distance_m / (sample_count - 1), 2) for index in range(sample_count)]
    velocity = [round((distance_m / moving_time_s) * (0.94 + 0.12 * rng.random()), 3) for _ in range(sample_count)]
    heartrate = _heartrate_for_workout(activity.workout_type or "easy", moving_time_s, sample_count)
    altitude = _altitude_stream(float(activity.elevation_gain_m or 0), rng, sample_count)
    latlng = _route_points(cluster, distance_m, rng, sample_count)
    moving = [True for _ in range(sample_count)]
    return [
        _stream(activity.id, "time", time_values),
        _stream(activity.id, "distance", distance_values),
        _stream(activity.id, "heartrate", heartrate),
        _stream(activity.id, "altitude", altitude),
        _stream(activity.id, "velocity_smooth", velocity),
        _stream(activity.id, "moving", moving),
        _stream(activity.id, "latlng", latlng),
    ]


def _create_demo_plans(session: Session, demo_user: User, patterns: DemoPatterns, today: date) -> int:
    """Create upcoming planned workouts for the demo account."""
    plan_start = week_start(today)
    plan = TrainingPlan(
        user_id=demo_user.id,
        title="Demo build block",
        goal_type="manual_week",
        start_date=plan_start,
        end_date=plan_start + timedelta(weeks=8, days=-1),
        status="active",
    )
    session.add(plan)
    session.flush()
    count = 0
    for week_index in range(8):
        current_week = plan_start + timedelta(weeks=week_index)
        for sort_order, day_offset in enumerate(_run_days_for_week(patterns.weekly_runs, week_index)):
            workout_date = current_week + timedelta(days=day_offset)
            if workout_date <= today:
                continue
            workout_type = _workout_type(sort_order)
            distance = _planned_distance_for_workout(patterns, workout_type)
            session.add(
                PlannedWorkout(
                    user_id=demo_user.id,
                    plan_id=plan.id,
                    scheduled_date=workout_date,
                    sort_order=sort_order,
                    workout_type=workout_type,
                    title=_planned_title(workout_type),
                    target_duration_s=int(round((distance / 1000) * _planned_pace(patterns, workout_type))),
                    target_distance_m=Decimal(str(distance)),
                    target_intensity=_target_intensity(workout_type),
                    instructions=_planned_instructions(workout_type),
                    status="planned",
                )
            )
            count += 1
    return count


def _run_days_for_week(weekly_runs: int, week_index: int) -> list[int]:
    """Return run day offsets for one generated week."""
    if weekly_runs <= 3:
        return [0, 2, 6]
    if weekly_runs >= 5 and week_index % 3 == 0:
        return [0, 1, 3, 5, 6]
    return [0, 2, 4, 6]


def _workout_type(run_index: int) -> str:
    """Return workout type for a run position in a week."""
    if run_index == 1:
        return "tempo"
    if run_index >= 3:
        return "long"
    return "easy"


def _distance_for_workout(patterns: DemoPatterns, workout_type: str, rng: random.Random, cutback_factor: float) -> int:
    """Return generated distance for one workout."""
    if workout_type == "long":
        base = patterns.long_distance_m
    elif workout_type == "tempo":
        base = int(patterns.easy_distance_m * 1.15)
    else:
        base = patterns.easy_distance_m
    jitter = rng.uniform(0.9, 1.12)
    return int(round((base * cutback_factor * jitter) / 100) * 100)


def _pace_for_workout(patterns: DemoPatterns, workout_type: str, rng: random.Random) -> int:
    """Return generated pace for one workout."""
    if workout_type == "tempo":
        base = patterns.easy_pace_s_per_km - 38
    elif workout_type == "long":
        base = patterns.easy_pace_s_per_km + 12
    else:
        base = patterns.easy_pace_s_per_km
    return int(round(base + rng.uniform(-10, 10)))


def _heartrate_for_workout(workout_type: str, moving_time_s: int, sample_count: int = 64) -> list[int]:
    """Return generated heart-rate values for one workout."""
    _ = moving_time_s
    if workout_type == "tempo":
        base = 156
        swing = 15
    elif workout_type == "long":
        base = 139
        swing = 10
    else:
        base = 132
        swing = 7
    return [round(base + math.sin(index / sample_count * math.pi) * swing) for index in range(sample_count)]


def _rpe_for_workout(workout_type: str) -> int:
    """Return generated perceived effort for one workout."""
    if workout_type == "tempo":
        return 7
    if workout_type == "long":
        return 5
    return 3


def _activity_title(workout_type: str) -> str:
    """Return activity title text for one workout."""
    if workout_type == "tempo":
        return "progression run"
    if workout_type == "long":
        return "long run"
    return "easy run"


def _elevation_for_workout(distance_m: int, workout_type: str, rng: random.Random) -> int:
    """Return generated elevation gain for one workout."""
    multiplier = 0.014 if workout_type == "long" else 0.009
    return int(round(distance_m * multiplier + rng.uniform(10, 45)))


def _gear_for_workout(gear: list[Gear], workout_type: str) -> Gear:
    """Return the generated gear item for a workout."""
    if workout_type == "tempo":
        return gear[1]
    if workout_type == "long":
        return gear[2]
    return gear[0]


def _altitude_stream(elevation_gain_m: float, rng: random.Random, sample_count: int) -> list[float]:
    """Return generated altitude stream values."""
    baseline = 180 + rng.uniform(-25, 25)
    return [
        round(baseline + math.sin(index / sample_count * math.pi * 2) * 8 + (elevation_gain_m * index / sample_count / 8), 1)
        for index in range(sample_count)
    ]


def _route_points(cluster: RouteCluster, distance_m: float, rng: random.Random, sample_count: int) -> list[list[float]]:
    """Return synthetic GPS points around a public city cluster."""
    radius = max(0.009, min(0.045, distance_m / 420000))
    points: list[list[float]] = []
    for index in range(sample_count):
        angle = (math.pi * 2 * index) / sample_count
        wobble = 1 + 0.12 * math.sin(angle * 3)
        lat = cluster.center_lat + math.sin(angle) * radius * 0.72 * wobble + rng.uniform(-0.00035, 0.00035)
        lng = cluster.center_lng + math.cos(angle) * radius * wobble + rng.uniform(-0.00035, 0.00035)
        points.append([round(lat, 6), round(lng, 6)])
    return points


def _stream(activity_id: UUID, stream_type: str, data: list) -> ActivityStream:
    """Return one generated activity stream."""
    return ActivityStream(activity_id=activity_id, stream_type=stream_type, data=data, sample_count=len(data))


def _planned_distance_for_workout(patterns: DemoPatterns, workout_type: str) -> int:
    """Return planned workout distance."""
    if workout_type == "tempo":
        return int(patterns.easy_distance_m * 1.2)
    if workout_type == "long":
        return patterns.long_distance_m
    return patterns.easy_distance_m


def _planned_pace(patterns: DemoPatterns, workout_type: str) -> int:
    """Return planned workout pace."""
    if workout_type == "tempo":
        return patterns.easy_pace_s_per_km - 35
    if workout_type == "long":
        return patterns.easy_pace_s_per_km + 15
    return patterns.easy_pace_s_per_km


def _planned_title(workout_type: str) -> str:
    """Return planned workout title."""
    if workout_type == "tempo":
        return "Progression tempo"
    if workout_type == "long":
        return "Capital city long run"
    return "Easy aerobic run"


def _target_intensity(workout_type: str) -> str:
    """Return planned target intensity."""
    if workout_type == "tempo":
        return "hard"
    if workout_type == "long":
        return "moderate"
    return "easy"


def _planned_instructions(workout_type: str) -> str:
    """Return planned workout instructions."""
    if workout_type == "tempo":
        return "Start relaxed, then progress through the middle third before cooling down."
    if workout_type == "long":
        return "Keep the first half conversational and finish steady if the legs feel good."
    return "Stay relaxed and keep the effort easy."
