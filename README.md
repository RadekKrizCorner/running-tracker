# Running Tracker

Personal running tracker for importing Strava runs, monitoring training progress, planning future workouts, and presenting a read-only portfolio demo account with realistic generated data.

**Demo account available.**

## Highlights

- Strava OAuth import with server-side encrypted provider tokens.
- Dashboard for weekly distance, time, load, intensity, consistency, and trends.
- Activity detail pages with splits, heart-rate breakdowns, route maps, notes, and gear assignment.
- Manual weekly planning with reusable workout templates, copy-week workflow, and plan-vs-actual comparison.
- Calendar and event tracking for races, goal events, custom notes, and preparation metrics.
- Route heatmap built from owner-scoped GPS stream aggregation.
- Weekly report SVG/PNG generation plus an Instagram report builder with saved templates, weekly prefill, preview, and export.
- Public read-only demo account with fictional rolling data and synthetic city routes.

## Tech Stack

| Area | Stack |
| --- | --- |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Data | PostgreSQL 16, Redis, RQ |
| Frontend | React, TypeScript, Vite, TanStack Query, Recharts, MapLibre |
| Integrations | Strava OAuth/API, optional elevation provider |
| Testing | pytest, Vitest, Testing Library |
| Deployment | Docker Compose, production Compose, local Kubernetes manifests |

## Architecture

```text
React/Vite frontend
        |
        v
FastAPI API ---- PostgreSQL
        |
        +---- Redis/RQ worker
        |
        +---- Scheduler for Strava sync and demo refresh
        |
        +---- Strava OAuth/API
```

The app is intentionally scoped as a personal single-owner tracker. Authenticated reads and writes are scoped to the current user, Strava tokens stay server-side, and provider tokens are encrypted at rest.

## Feature Overview

### Training Dashboard

The dashboard summarizes recent training with weekly volume, moving time, load, intensity split, long-run progress, consistency, and upcoming planned sessions. It supports simple and advanced views so the same app can work as either a quick status board or a detailed training cockpit.

### Strava Import And Sync

The owner connects Strava through browser OAuth. Sync jobs run through Redis/RQ, import running activities, fetch activity streams, upsert by provider activity ID, and recompute weekly metrics after new data arrives. The scheduler can queue recent syncs automatically.

### Planning And Calendar

The Plans page supports manual weekly scheduling, reusable templates, workout pools, multiple sessions per day, week copying, and live planned distance/time/load totals. The Calendar combines planned workouts, completed runs, custom events, and goal races.

### Events And Race Preparation

Events store race date, location, surface, priority, target time, website, GPX/course map data, poster images, and planning notes. Preparation metrics are calculated from local activity history and upcoming plans.

### Trends, Heatmap, And Reports

Trends cover load, durability, HR-zone time, easy pace, long-run share, plan adherence, monotony, hilliness, and coach-effect signals. The heatmap aggregates owner-only GPS streams into route density cells. Reports include the original weekly SVG/PNG export and a structured Instagram builder that can prefill owner weekly data, edit copy, preview SVG, export SVG/PNG, and save reusable templates or report drafts.

### Portfolio Demo Account

The demo account is public and read-only. Its data is generated separately from the real owner account, using safe aggregate patterns where configured and synthetic routes around recognizable public city areas. It does not copy provider tokens, real GPS tracks, private notes, or real event details.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node 22+ for local frontend work outside Docker
- Python 3.12+ for local backend work outside Docker
- Native Cairo/Pango libraries for local PNG report rendering outside Docker. Docker installs these automatically. On macOS with Homebrew, install `cairo`, `pango`, and `gdk-pixbuf`; on Debian/Ubuntu, install `libcairo2`, `libpango-1.0-0`, `libpangocairo-1.0-0`, and `libgdk-pixbuf-2.0-0`.

### Run With Docker Compose

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

Default local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8009`
- Health: `http://localhost:8009/health`

If those host ports are already in use, set `API_PORT` or `FRONTEND_PORT` in `.env` and update `APP_BASE_URL`, `STRAVA_REDIRECT_URI`, and `VITE_API_BASE_URL` to match the chosen API port.

### Migrations

```bash
cd backend
alembic upgrade head
```

The app also creates tables at startup for local personal deployment convenience, but Alembic remains the explicit schema history.

### Seed Sample Data

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

## Demo Account Setup

Enable the portfolio demo in `.env`:

```bash
DEMO_ACCOUNT_ENABLED=true
DEMO_ACCOUNT_EMAIL=demo@example.com
DEMO_ACCOUNT_PASSWORD=replace-with-a-long-demo-password
DEMO_ACCOUNT_DISPLAY_NAME="Portfolio Demo"
DEMO_REFRESH_ENABLED=true
DEMO_REFRESH_INTERVAL_SECONDS=86400
DEMO_REFRESH_FROM_OWNER_PATTERNS=true
DEMO_REFRESH_HISTORY_WEEKS=78
```

Refresh the demo data manually:

```bash
cd backend
python -m app.db.refresh_demo_account --from-owner-patterns --weeks 78
```

Use `--synthetic-only` to ignore owner aggregate patterns. The refresh command creates or updates the demo user, clears generated records for that demo user only, creates rolling activities, streams, plans, events, gear, and weekly metrics, and leaves the real owner account untouched.

For production portfolio use, keep the scheduler container running with `DEMO_REFRESH_ENABLED=true`. The existing scheduler loop refreshes demo data once per `DEMO_REFRESH_INTERVAL_SECONDS`, normally daily.

## Strava Setup

The app uses Strava's browser OAuth flow. The owner connects Strava from Settings; users do not generate or paste access tokens manually.

1. Create a Strava API application.
2. Set callback URL/domain for local or hosted use.
3. Copy client ID and secret into `.env`.
4. Set `STRAVA_REDIRECT_URI=http://localhost:8009/api/v1/connections/strava/callback`.
5. Start the app and log in as the owner.
6. Open Settings and click Connect Strava.
7. Run sync from Dashboard or Settings.

The first manual sync imports roughly the last 24 months of running activities. Later syncs use the newest imported Strava activity minus a 7-day overlap so edited or late-arriving activities are refreshed without repeatedly scanning the full history.

## Developer Commands

Backend:

```bash
cd backend
python -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/python -m pytest
python -m app.jobs.worker
python -m app.jobs.scheduler
```

Frontend:

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
```

Production-style Compose:

```bash
docker compose -f docker-compose.prod.yml up --build
```

This stack serves the built frontend through Nginx and runs Uvicorn without development reload.

## API Examples

Generate a weekly report from an authenticated session:

```bash
curl -b "session=<session-cookie>" \
  "http://localhost:8009/api/v1/analytics/weekly-report.svg?week_start_date=2026-05-18" \
  -o weekly-report-2026-05-18.svg
```

Request the rasterized PNG version:

```bash
curl -b "session=<session-cookie>" \
  "http://localhost:8009/api/v1/analytics/weekly-report.png?week_start_date=2026-05-18" \
  -o weekly-report-2026-05-18.png
```

Prefill and render an Instagram report builder draft:

```bash
curl -b "session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"week_start_date":"2026-05-18"}' \
  "http://localhost:8009/api/v1/reports/prefill"
```

```bash
curl -b "session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"values":{"title":"Týdenní běžecký report","week":"Týden 1","main_distance":"25,4","main_unit":"km"}}' \
  "http://localhost:8009/api/v1/reports/render.svg" \
  -o instagram-report.svg
```

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

## Privacy And Security

- Single-owner V1 scope.
- Strava access and refresh tokens are stored only on the backend.
- Provider tokens are encrypted at rest with an authenticated application secret.
- GPS tracks, heart rate, timestamps, subjective notes, and OAuth tokens are treated as sensitive data.
- Portfolio demo data is fictional and generated for a separate read-only account.
- Export excludes provider tokens.
- Account deletion removes local app data and does not delete data from Strava.

## Known Limitations

- Garmin direct API integration is intentionally deferred.
- Stream-based PR detection is marked for a later iteration; V1 uses activity-level records.
- MapLibre rendering degrades cleanly when no GPS stream exists.
- Strava webhooks are not implemented because local personal use usually lacks a public callback URL.
