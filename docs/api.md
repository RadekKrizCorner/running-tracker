# API Notes

All application endpoints are prefixed with `/api/v1` and require authentication unless they are auth setup/login/demo-login/logout or health. The optional portfolio demo session is public but read-only.

Core groups:

- `/auth/*` owner setup, login, demo login, logout, self, and password changes.
- `/connections/strava/*` OAuth, status, sync, sync job status, and disconnect.
- `/activities/*` activity list/detail with HR zone breakdown, streams, notes, gear assignment, and splits.
- `/analytics/*` dashboard, weekly metrics, yearly running summary, recent dense weekly metrics, detailed trend metrics, load, intensity, aerobic trend, PRs, and GPS route heatmap.
- `/events/*` goal races/events with countdown, target pace, preparation/readiness metrics, editable race notes, course URL, and GPX course data.
- `/report-templates/*`, `/reports/*` Instagram report templates, saved report drafts, weekly prefill, and SVG/PNG rendering.
- `/routes/suggest-loop` owner-authenticated self-hosted loop route suggestions.
- `/profile/hr-zones` dated owner heart-rate zones used for sync-time load and intensity calculation.
- `/profile/hr-zones/recompute` explicit recalculation for imported HR activities after zones are configured.
- `/calendar`, `/calendar/week`, `/calendar/events/*`, `/planned-workouts/*`, `/plans/*`, `/workout-templates/*` planning, manual weekly schedules, completed activities, custom events, races, and reusable templates.
- `/gear/*` shoe CRUD, mileage, and assigned activities.
- `/export/data`, `/account` local data export and deletion.

Errors use:

```json
{
  "detail": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

Demo write attempts return:

```json
{
  "detail": "Demo account is read-only",
  "code": "DEMO_READ_ONLY"
}
```

## Event Readiness

`GET /api/v1/events/{event_id}/readiness` returns owner-scoped readiness context for one event. It requires authentication and returns 404 when the event does not belong to the current owner.

The response includes countdown/phase, target pace, recent 4-week distance/load/run count, longest 8-week run, long-run distance ratio, planned distance/load/sessions through event day, missed planned sessions, recent intensity mix seconds, readiness items, and guidance messages. Missed planned sessions are deduplicated by logical planned session and matched against explicit completed activity links or same-day completed runs. Readiness item statuses are `good`, `watch`, `missing`, or `neutral`; they are transparent planning context, not medical or injury predictions.

`GET /api/v1/auth/options` is public and returns whether the portfolio demo login should be shown:

```json
{
  "demo_enabled": true
}
```

## Route Suggestions

`POST /api/v1/routes/suggest-loop` requires an authenticated owner session. It does not store route suggestions. The backend calls the configured local routing provider only when `ROUTING_ENABLED=true` and the start point is inside the configured route suggestion bounds. The default bounds cover the Czech Republic. `ROUTING_PROVIDER=local_demo` returns approximate demo loops without a routing service; `ROUTING_PROVIDER=valhalla` requires `VALHALLA_BASE_URL` and returns road-aware routes from local Valhalla.

Request:

```json
{
  "start_lat": 50.0755,
  "start_lng": 14.4378,
  "target_distance_m": 12000,
  "distance_tolerance_m": 800,
  "hill_preference": "balanced",
  "surface_preference": "mixed",
  "candidate_count": 3
}
```

Response when routing is disabled or unavailable:

```json
{
  "status": "unavailable",
  "detail": "Route suggestions are disabled. Enable local demo routing or configure local Valhalla.",
  "candidates": []
}
```

Successful responses return `status="ok"` and candidates with distance, duration, optional elevation gain, `[lat, lng]` geometry, provider, score, and warnings. `local_demo` candidates include a warning that the route is not snapped to roads.

Route Explorer displays target distance and tolerance in kilometers, then sends `target_distance_m` and `distance_tolerance_m` to this API in meters.

## Activities List

`GET /api/v1/activities` returns owner-scoped activities. The list supports:

- `search`: case-insensitive match against the activity name.
- `start_date` and `end_date`: owner-local date range filters.
- `intensity_class`, `sport_type`, `workout_type`, `min_distance_m`, `max_distance_m`, `has_hr`, and `gear_id`: structured filters.
- `sort`: prefix with `-` for descending order. Supported keys are `start_time`, `distance`, `moving_time`, `pace`, `average_hr`, `computed_load`, and `elevation_gain`.
- `page` and `page_size`: pagination, defaulting to page `1` and `50` rows.

## Report Builder

Report builder endpoints are owner-scoped and authenticated.

- `GET /api/v1/report-templates`: list owner templates. Normal owner reads create the default Instagram story template when missing; demo reads do not write defaults.
- `POST /api/v1/report-templates`: create an owner template.
- `GET /api/v1/report-templates/{template_id}`: read one owner template.
- `PATCH /api/v1/report-templates/{template_id}`: update one owner template.
- `DELETE /api/v1/report-templates/{template_id}`: delete one owner template and detach saved report drafts from it.
- `GET /api/v1/reports`: list owner saved report drafts.
- `POST /api/v1/reports`: create an owner saved report draft.
- `GET /api/v1/reports/{report_id}`: read one owner saved report draft.
- `PATCH /api/v1/reports/{report_id}`: update one owner saved report draft.
- `DELETE /api/v1/reports/{report_id}`: delete one owner saved report draft.
- `POST /api/v1/reports/prefill`: build editable Instagram report values from one owner week of plans and completed runs.
- `POST /api/v1/reports/render.svg`: render submitted report values to SVG. Submitted values are size-limited.
- `POST /api/v1/reports/render.png`: render submitted report values to PNG. Submitted values are size-limited.
