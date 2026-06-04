# High-Level Documentation

This document explains Running Tracker from the product and user-workflow perspective. For module-level details, see `docs/technical.md`.

## Product Purpose

Running Tracker is a personal, single-owner running dashboard. It imports Strava running data, keeps provider tokens on the server, turns completed runs into transparent progress metrics, and gives the owner one place to review training, plan upcoming workouts, track events, and monitor long-term trends.

The app is intentionally V1 and personal-use scoped. It is not a coaching marketplace, a medical product, a social network, or a multi-user team platform.

## Main Outcomes

- Import and refresh running activities from Strava.
- Review weekly distance, time, load, elevation, intensity, and recent activity history.
- Inspect individual runs with route map, stream charts, HR zone breakdown, splits, and notes.
- Plan a week of workouts from reusable templates or custom sessions.
- Compare planned training with completed training.
- Track race and event preparation.
- View trend signals such as load, easy pace, HR zones, long-run share, consistency, monotony, and plan adherence.
- Track GPS route density through a heatmap.
- Track shoe mileage and retirement warning state.
- Export or delete local owner data.

## User Model

The application has one owner account. The owner email is configured through `OWNER_EMAIL`; first-run setup only accepts that email. After setup, login uses an HTTP-only session cookie. There is no user invitation, role, tenant, admin, or sharing model.

Every backend feature is expected to be scoped to the authenticated owner. Public behavior is limited to health and auth setup/login/logout flows.

## First-Run Flow

1. Create `.env` from `.env.example`.
2. Generate and configure `TOKEN_ENCRYPTION_KEY`.
3. Set `OWNER_EMAIL`, `SECRET_KEY`, database, Redis, frontend, and Strava values.
4. Start the stack with Docker Compose.
5. Open the frontend and use Setup to set the owner password.
6. Connect Strava from Settings.
7. Run a history sync to import roughly the last 24 months of running activities.
8. Configure heart-rate zones so load and intensity can use HR data.
9. Optionally create weekly plans, events, gear, avatar, language, dashboard mode, and elevation correction settings.

## Main Application Areas

### Dashboard

Dashboard is the default authenticated screen. It shows this week's completed distance, moving time, run count, longest run, load, elevation, intensity split, recent activities, upcoming workouts, onboarding status, Strava sync controls, sync progress, and a planned-vs-completed week comparison.

Dashboard can run in Simple or Advanced mode. Simple focuses on basic progress and plans. Advanced adds load, elevation, intensity, and charts.

### Activities

Activities lists imported runs with filters and key metrics: date, name, distance, time, pace, average HR, load, and intensity. Activity detail shows a route map, stream charts, split table, HR zone breakdown, trail-effort summary, and editable notes.

Activity notes support subjective values such as RPE, fatigue, soreness, pain flag, pain location, sleep quality, and free-text notes. RPE can influence load and intensity when HR zones are missing.

### Calendar

Calendar combines planned workouts, completed activities, custom calendar events, and goal events into week or month views. A day drawer gives quick access to day items, custom event creation, and workout planning.

### Plans

Plans is a manual weekly scheduler. The owner can choose a week, name the plan, add easy/rest/default workouts, drag or click reusable templates, create custom templates, use a workout pool, create multiple sessions on one day, and copy weeks.

The page computes planned distance, planned time, planned load, and session count live before saving.

### Events

Events tracks races and other running goals. An event can store date, location, type, distance, elevation, surface, priority, status, target time, website, course map URL, GPX data, poster image, and notes for goal, course, fueling, gear, and travel.

The backend calculates preparation metrics such as countdown, phase, target pace, current four-week distance/load, longest recent run, planned training until the event, missed planned sessions, and long-run readiness.

### Trends

Trends is the long-term monitoring area. It shows weekly load/volume, elevation, load baseline, easy-run efficiency, durability, personal records, HR zone time, easy pace, pace by HR zone, plan-vs-reality adherence, monotony, and a transparent coach-effect verdict.

Trend metrics are indicators, not medical advice. They are designed to show why the app reached a conclusion.

### Heatmap

Heatmap visualizes repeated GPS route density. The backend aggregates owner-only `latlng` stream samples into rounded map cells before returning them to the frontend. The page supports all-time, 24-month, 12-month, 6-month, 3-month, and custom ranges.

### Settings

Settings manages Strava connection, manual sync, HR zones, HR recalculation, display mode, language, elevation correction, privacy export, account deletion, and avatar preferences.

HR zone sets are dated. A zone set only applies to activities on or after its effective date until a newer set becomes effective.

### Notifications

Notifications are in-app owner reminders. Current behavior creates deduplicated reminders to add notes to recently synced activities. Notifications can be read, read all, deleted, and opened from the shell popover.

### Gear

Gear tracks shoes or other running gear. Gear can be assigned to activities, and total distance is calculated from assigned activity mileage. A retirement warning appears when assigned distance reaches 90% of the configured retirement distance.

The backend API and data model support gear management and activity assignment. The current frontend route tree does not include a dedicated top-level gear page or visible gear assignment workflow.

## Data Lifecycle

1. Strava OAuth stores encrypted access and refresh tokens server-side.
2. A sync job fetches activity summaries, detail payloads, and supported streams.
3. Running activities are normalized into local `activities` rows.
4. Streams are stored separately by stream type.
5. Activity metrics are recomputed from HR zones, RPE, or duration fallback.
6. Weekly metrics are recomputed from owner-scoped running activities.
7. Frontend pages fetch typed API payloads and render charts, maps, lists, and forms.
8. Export returns local data without provider tokens.
9. Account deletion removes local owner data and cascaded app records.

## Privacy And Security Posture

- Strava tokens are encrypted at rest with Fernet.
- Tokens are never sent to the frontend.
- Session cookies are HTTP-only and signed by the backend.
- Export excludes provider tokens.
- GPS, HR, notes, timestamps, and OAuth state are treated as sensitive local data.
- Account deletion removes local app data only; it does not delete Strava data.

## V1 Boundaries

- Single owner only.
- Strava browser OAuth only.
- No Garmin direct API integration.
- No Strava webhooks.
- No paid service dependency.
- No medical risk prediction.
- No social, sharing, or coach/admin workflow.
- Stream-based PR detection is not implemented; PRs are activity-level summaries.
