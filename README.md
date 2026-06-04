# Running Tracker

Personal-use running dashboard for importing Strava training data, monitoring weekly progress, tracking shoe mileage, and planning upcoming workouts.

## Tech Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, Redis, RQ
- Frontend: React, TypeScript, Vite, TanStack Query, Recharts, MapLibre-ready map surface
- Tests: pytest and Vitest

## Documentation

- [High-level product documentation](docs/high-level.md)
- [Technical codebase documentation](docs/technical.md)
- [API notes](docs/api.md)
- [Metrics documentation](docs/metrics.md)
- [Privacy documentation](docs/privacy.md)
- [V1 stack decision](docs/decisions/0001-v1-stack.md)
- [Deployment notes](docs/deployment/tasov-main.md)
- [Local Kubernetes walkthrough](docs/deployment/kubernetes-local.md)
- [Kubernetes operations guide](docs/deployment/kubernetes-operations.md)

## Prerequisites

- Docker and Docker Compose
- Node 22+ for local frontend work outside Docker
- Python 3.12+ for local backend work outside Docker

## Local Setup

```bash
cp .env.example .env
python - <<'PY'
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
PY
```

Copy the generated Fernet key into `TOKEN_ENCRYPTION_KEY`, set `OWNER_EMAIL`, then start the stack:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8009`
- Health: `http://localhost:8009/health`

If those host ports are already in use, set `API_PORT` or `FRONTEND_PORT` in `.env` and update `APP_BASE_URL`, `STRAVA_REDIRECT_URI`, and `VITE_API_BASE_URL` to match the chosen API port.

## Production-style Compose

For private self-hosting without dev reload or source bind mounts:

```bash
docker compose -f docker-compose.prod.yml up --build
```

This stack serves the built frontend through Nginx and runs Uvicorn without `--reload`.

## Local Kubernetes Learning

To try the same app topology in a local Kubernetes cluster with kind, Kustomize, Postgres, Redis, API, worker, scheduler, and frontend workloads:

```bash
open docs/deployment/kubernetes-local.md
```

## Migrations

```bash
cd backend
alembic upgrade head
```

The app also creates tables at startup for local personal deployment convenience.

## Seed Sample Data

```bash
cd backend
python -m app.db.seed_dev
```

The seed creates the owner, 12 weeks of sample runs, HR streams, planned workouts, and two shoes. Default seed password: `passwordpassword`.

To remove deterministic sample records after connecting real Strava data:

```bash
cd backend
python -m app.db.cleanup_seed
```

The cleanup removes only seed activities with `manual` provider IDs starting with `seed-`, sample planned workouts, and the sample shoes.

## Planning

The Plans page is a manual weekly scheduler. Pick a week, name the week plan, assign workouts from reusable templates, or enter custom workouts directly. The page shows live planned distance, planned time, estimated planned load, and non-rest session count before saving. The Dashboard compares completed training against the planned week and includes previous/current/next week controls for reviewing nearby weeks.

Reusable templates cover common workouts like easy run, long run, recovery, tempo, intervals, strength, and rest. You can create custom templates with title, type, target distance, target duration, intensity, and instructions to avoid retyping similar workouts.

The Calendar page shows planned workouts, completed activities, and custom events such as races.

## Weekly Reports

The API can generate a 1080x1920 weekly visual report from the authenticated owner's plan and completed runs. Use the same Monday `week_start_date` as the Dashboard and Plans pages.

```bash
curl -b "session=<session-cookie>" \
  "http://localhost:8009/api/v1/analytics/weekly-report.svg?week_start_date=2026-05-18" \
  -o weekly-report-2026-05-18.svg
```

For social sharing, request the rasterized PNG version:

```bash
curl -b "session=<session-cookie>" \
  "http://localhost:8009/api/v1/analytics/weekly-report.png?week_start_date=2026-05-18" \
  -o weekly-report-2026-05-18.png
```

## Events

The Events page tracks goal races and running events. Each event can store name, date, location, type, distance, elevation, surface, priority, target time, website, course map URL, GPX course data, and notes for goals, course, fueling, gear, and travel.

Event preparation metrics are calculated from local data:

- Days and weeks until start.
- Target pace from distance and target time.
- Current 4-week running distance and load.
- Longest run in the last 8 weeks and its share of event distance.
- Planned distance, load, and sessions until the event.
- Missed planned sessions in the recent preparation window.
- Preparation phase: base, build, peak, taper, race week, completed, or cancelled.

Events also appear on the Calendar and link back to the event detail page.

Event detail can render a course map from pasted or imported GPX route data. If no GPX is available, add a full `https://` Mapy.com or race course URL; the page embeds it when the provider allows embeds and always keeps an Open course link available.

## Heart-rate Zones

Add HR zones in Settings. Each zone set has an effective date, so when zones change over time the app can calculate an activity with the zone set that was active on that activity date. Saving zones recomputes already imported activities that have HR streams or average HR; future syncs calculate new or updated activities the same way. Use **Recalculate intensity** in Settings if imported runs still show as unknown after saving or changing zones.

If HR data exists but runs remain unknown, check the zone set effective date. A zone set dated today does not apply to yesterday's run or older historical imports. Add another zone set with the same boundaries effective on or before the first imported activity date, then recalculate intensity.

Activity classification stores one easy, moderate, hard, or unknown label per activity:

- HR stream plus zones: easy if at least 70% of samples are in Z1/Z2, hard if at least 20% are in Z4/Z5, otherwise moderate.
- Average HR plus zones: approximate classification from the activity average when stream data is not available.
- RPE fallback: 1-4 easy, 5-6 moderate, 7-10 hard.
- No HR zones and no RPE: unknown.

Activity detail also shows a heart-rate zone breakdown when HR data and an effective zone set are available. Weekly intensity split in Dashboard and Trends uses the same breakdown when possible: Z1/Z2 seconds count as easy, Z3 seconds as moderate, and Z4/Z5 seconds as hard. If an activity has no usable HR breakdown, the weekly split falls back to the stored activity label and shows unknown time separately when neither HR zones nor RPE can classify it.

## Dashboard View

The Dashboard supports Simple and Advanced views. Simple focuses on distance, time, consistency, and plans. Advanced also shows load, intensity, and trend charts. Change the default view in Settings under Dashboard view.

## Trends View

The Trends page combines weekly load and durability with detailed trend metrics. Detailed trends are calculated from existing owner data without storing extra weekly columns: HR zone time over weeks, easy pace, long-run share, run-day consistency, elevation gain per km, pace by HR zone, plan-vs-reality adherence, and weekly load monotony. Metrics that need aligned stream data, such as pace by HR zone, show unavailable values when the imported activity does not include usable time, distance, and heart-rate streams.

## Heatmap

The Heatmap page shows where imported GPS runs overlap most often. The backend aggregates owner-only `latlng` streams into approximate map cells before sending them to the frontend, so the page does not need to load every raw GPS sample. Longer or slower runs can contribute more samples because the heatmap represents route density from recorded GPS points.

## Strava Setup

The app uses Strava's browser OAuth flow. The owner connects Strava from Settings; users do not generate or paste access tokens manually.

1. Create a Strava API application.
2. Set callback URL/domain for local or hosted use.
3. Copy client ID and secret into `.env`.
4. Set `STRAVA_REDIRECT_URI=http://localhost:8009/api/v1/connections/strava/callback`.
5. Start the app and log in as the owner.
6. Open Settings and click Connect Strava. The browser opens Strava authorization, then returns to Settings after approval.
7. Run sync from Dashboard or Settings.

The first manual sync imports roughly the last 24 months of running activities. If an older build only imported recent activities, the next sync backfills the 24-month window before switching to incremental syncs. Later syncs use the newest imported Strava activity minus a 7-day overlap so edited or late-arriving activities are refreshed without repeatedly scanning the full history.

Sync runs through Redis/RQ. Clicking Sync Now queues a background job, disables the button while the job is queued or running, and polls job status until it finishes or fails. Docker Compose starts both the worker and a scheduler automatically. The scheduler queues a recent Strava sync every 6 hours by default (`STRAVA_AUTO_SYNC_INTERVAL_SECONDS=21600`), so connected accounts sync at least 4 times per day. Larger configured intervals are capped to 6 hours. It skips scheduling when Strava is disconnected or a sync job is already queued/running for the owner.

Troubleshooting:

- Invalid redirect URI: match Strava app callback and `STRAVA_REDIRECT_URI`.
- Missing activity scope: reconnect and approve `activity:read_all`.
- Authorization failed in browser: start the connection from Settings again so the backend can issue a fresh OAuth state.
- Token expired: the backend refreshes tokens automatically; reconnect if refresh fails.
- Rate limit reached: wait for Strava limits to reset and sync again.
- No activities imported: V1 imports running activity types by default.
- Private activities missing: ensure `activity:read_all` was granted.

## Tests

Backend:

```bash
cd backend
python -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/python -m pytest
```

Frontend:

```bash
cd frontend
npm install
npm test
npm run build
```

## Worker

```bash
cd backend
python -m app.jobs.worker
```

For periodic Strava syncs outside Docker, run the scheduler in a second process:

```bash
cd backend
python -m app.jobs.scheduler
```

Docker Compose starts the worker and scheduler automatically. Set `STRAVA_AUTO_SYNC_ENABLED=false` to disable automatic syncs.

## Privacy Notes

- This is a single-owner app.
- Strava access and refresh tokens are stored only on the backend and encrypted at rest with an authenticated application secret.
- GPS tracks, heart rate, timestamps, subjective notes, and OAuth tokens are treated as sensitive data.
- Export excludes provider tokens.
- Account deletion removes local app data and does not delete data from Strava.

## Known Limitations

- Garmin direct API integration is intentionally deferred.
- Stream-based PR detection is marked for a later iteration; V1 uses activity-level records.
- MapLibre rendering has a ready UI slot; the current V1 degrades cleanly when no GPS stream exists.
- Strava webhooks are not implemented because local personal use usually lacks a public callback URL.
