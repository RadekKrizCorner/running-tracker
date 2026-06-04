# Portfolio Demo Account Design

## Goal

Create an optional public demo account for the portfolio deployment. The demo account should show a realistic, active running profile without exposing the owner's private Strava data, GPS routes, heart-rate history, event schedule, notes, or provider tokens.

## Scope

The feature remains within the V1 personal-use model. The app still has one real owner account. The demo account is a special optional account used only for portfolio access.

In scope:

- A separate demo user with explicit read-only behavior.
- Demo login flow for public visitors.
- Server-side generation of realistic fictional training data.
- Pattern learning from safe owner aggregates when available.
- Synthetic GPS routes around famous public places and capital cities.
- Daily refresh support in production through the existing scheduler container or a small cron-like loop.
- Documentation for setup, privacy, and operations.

Out of scope:

- General multi-user support.
- Public user registration.
- Sharing real Strava connections with demo visitors.
- Copying real GPS tracks, provider IDs, personal notes, or exact event details.
- Any paid external service.

## Account And Access Model

The demo account is configured explicitly:

- `DEMO_ACCOUNT_ENABLED`
- `DEMO_ACCOUNT_EMAIL`
- `DEMO_ACCOUNT_PASSWORD`
- `DEMO_ACCOUNT_DISPLAY_NAME`

The user model should include an explicit `is_demo` boolean. This is safer than detecting the demo user by email string and makes backend authorization decisions straightforward.

Demo sessions can read normal app data, including dashboard, activities, activity detail, streams, analytics, events, plans, calendar, heatmap, reports, profile, preferences, and notifications.

Demo sessions cannot mutate data. The backend must block demo writes, including activity edits, notes, gear changes, plans, events, HR zones, preferences, password change, data export, account deletion, notification mutations, and all Strava actions.

Logout remains allowed.

## Demo Login

The login page should expose a clear "Try demo" path when the demo account is enabled. The frontend should call a backend demo-login endpoint instead of publishing reusable credentials in page copy.

The normal owner login and first-run setup flows stay unchanged. Demo login must be disabled when `DEMO_ACCOUNT_ENABLED` is false.

`/auth/me` should include a safe `is_demo` flag so the frontend can render demo-aware UI.

## Frontend Read-Only Experience

Backend enforcement is mandatory. The frontend improves the visitor experience by making read-only state visible and intentional.

Recommended UI behavior:

- Show a compact "Demo" badge in the app shell.
- Hide or disable mutation controls for Strava, notes, plans, events, HR zones, preferences, password change, export, delete, and destructive actions.
- Use short disabled-state text only where needed, such as "Demo account is read-only".
- Keep navigation and detail exploration fully available.

Avoid a large persistent warning banner. The demo should feel like the real product, not a sandbox page.

## Data Generation Model

The refresh process has two phases:

1. Learn safe patterns from the private owner account.
2. Generate fictional data for the demo account.

Pattern learning may read safe aggregates:

- Weekly run count, distance, moving time, elevation, and load ranges.
- Intensity mix across easy, moderate, hard, and long runs.
- Long-run cadence.
- Typical pace and heart-rate ranges by workout type.
- Plan adherence patterns such as completed, missed, and adjusted sessions.
- Gear usage distribution.
- Seasonal shape such as build weeks, lighter weeks, and event weeks.

Pattern learning must not copy:

- Real GPS points or polylines.
- Real Strava IDs.
- Provider tokens.
- Exact timestamps.
- Exact event names or locations.
- Personal notes.
- Routes that could identify home, work, travel, or habits.

If owner data is insufficient, the generator falls back to high-quality synthetic defaults.

## Generated Dataset

The demo dataset should roll relative to today's date so it always looks active.

Generated records should include:

- 9 to 18 months of completed activities.
- A current week with partial progress.
- 4 to 8 weeks of planned workouts ahead.
- 1 to 3 fictional events, with at least one upcoming event.
- Realistic gear with mileage and retirement warnings.
- Heart-rate zone sets and preferences.
- Generic notes on a subset of activities.
- Notifications if useful for showing the shell behavior.
- Recomputed weekly metrics.

Each generated activity should include realistic streams where appropriate:

- `time`
- `distance`
- `heartrate`
- `altitude`
- `velocity_smooth`
- `moving`
- `latlng`

The generator should be deterministic from a seed plus today's date. That keeps the dataset stable enough for repeat visits while still rolling forward over time.

## Synthetic GPS Routes

The demo must not use copied real GPS tracks. Generated routes should be synthetic but placed around recognizable famous public places or capital cities.

Candidate route clusters:

- Prague: Letna, Stromovka, Vltava river paths.
- London: Hyde Park, Regent's Park, Thames paths.
- Paris: Bois de Boulogne, Seine paths.
- Berlin: Tiergarten, Tempelhofer Feld.
- Vienna: Prater, Donaukanal.

Routes can be loops, out-and-backs, long-run routes, hillier trail-style routes, and recovery routes. Activity names can reference the public area, such as "Prague river easy run" or "Hyde Park progression run".

Routes should be plausible for demo visualization but not copied from any runner's activity.

## Refresh And Operations

The first implementation should provide an explicit backend command:

```bash
cd backend
python -m app.db.refresh_demo_account
```

Useful command modes:

```bash
python -m app.db.refresh_demo_account --from-owner-patterns
python -m app.db.refresh_demo_account --synthetic-only
python -m app.db.refresh_demo_account --weeks 78
```

The command should:

- Create the demo user if missing.
- Set or update the demo password from environment configuration.
- Delete previous demo-generated records for the demo user only.
- Learn safe owner aggregates when enabled and available.
- Generate activities, streams, plans, events, gear, HR zones, preferences, and optional notifications.
- Recompute weekly metrics for the demo user.
- Never touch the real owner's records.
- Never create provider connections or Strava tokens for the demo user.
- Print a concise summary with generated counts and date ranges.

Production portfolio deployments must refresh the demo daily through the existing scheduler container or a small cron-like loop. This is a core requirement, not a later nice-to-have, because the portfolio demo should always show recent training and future plans.

The refresh process should be idempotent and safe to repeat.

## Failure Behavior

If required demo environment variables are missing, the command should fail clearly before creating partial data.

If owner pattern learning cannot run, the command should fall back to synthetic defaults when synthetic fallback is enabled.

The refresh should avoid leaving partial demo data. Prefer generating within a transaction or using a careful cleanup-and-rebuild strategy scoped only to the demo user.

## Privacy And Security Requirements

- Strava tokens remain server-side only.
- Demo users never receive Strava provider connections.
- Provider tokens are never copied.
- Real GPS tracks are never copied.
- Exact personal activity timestamps, notes, event details, and route locations are never copied.
- Every backend endpoint continues to enforce authentication.
- Every query remains scoped to the authenticated user.
- Demo read-only enforcement happens on the backend.
- Export and account deletion are blocked for demo sessions.

## Documentation Requirements

Update documentation during implementation:

- README: portfolio demo setup, env vars, refresh command, daily refresh operation.
- `docs/privacy.md`: demo data is generated, contains no provider tokens, and does not copy real GPS tracks.
- `docs/technical.md`: demo account flag, read-only guard, demo-login endpoint, refresh command, and scheduler/cron refresh behavior.

## Testing Requirements

Backend tests should cover:

- Demo login only works when enabled.
- Demo login creates a session for the demo user.
- `/auth/me` exposes `is_demo`.
- Demo user can read owner-scoped demo data.
- Demo user cannot call mutation endpoints.
- Demo user cannot connect, sync, or disconnect Strava.
- Demo refresh creates data only for the demo user.
- Demo refresh does not create provider connections or tokens.
- Owner data remains untouched by demo refresh.
- Python functions and methods added by the implementation have simple docstrings.

Frontend tests should cover:

- Login page shows "Try demo" only when supported by API state or enabled behavior.
- Demo sessions show a compact demo indicator.
- Mutation controls are hidden or disabled in demo sessions.
- Normal owner sessions are not affected.

## Open Implementation Decisions

- Whether demo refresh is implemented as a scheduler task inside the existing scheduler loop or as a separate cron-like process in deployment.
- Exact route-generation formulas for each famous public place.
- Exact number of activities and events generated by default.
- Whether notifications are included in demo data or omitted to reduce mutable UI.

## Spec Self-Review

No placeholders remain. The design keeps the V1 personal-use boundary by treating the demo account as a special optional account, not general multi-user support. The privacy requirements are explicit: no provider tokens, copied GPS tracks, exact timestamps, notes, or event details. The daily production refresh requirement is included as core scope. The remaining open decisions are implementation-level choices and do not block planning.
