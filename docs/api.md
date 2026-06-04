# API Notes

All application endpoints are prefixed with `/api/v1` and require authentication unless they are auth setup/login/demo-login/logout or health. The optional portfolio demo session is public but read-only.

Core groups:

- `/auth/*` owner setup, login, demo login, logout, self, and password changes.
- `/connections/strava/*` OAuth, status, sync, sync job status, and disconnect.
- `/activities/*` activity list/detail with HR zone breakdown, streams, notes, gear assignment, and splits.
- `/analytics/*` dashboard, weekly metrics, yearly running summary, recent dense weekly metrics, detailed trend metrics, load, intensity, aerobic trend, PRs, and GPS route heatmap.
- `/events/*` goal races/events with countdown, target pace, preparation metrics, editable race notes, course URL, and GPX course data.
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

`GET /api/v1/auth/options` is public and returns whether the portfolio demo login should be shown:

```json
{
  "demo_enabled": true
}
```

## Activities List

`GET /api/v1/activities` returns owner-scoped activities. The list supports:

- `search`: case-insensitive match against the activity name.
- `start_date` and `end_date`: owner-local date range filters.
- `intensity_class`, `sport_type`, `workout_type`, `min_distance_m`, `max_distance_m`, `has_hr`, and `gear_id`: structured filters.
- `sort`: prefix with `-` for descending order. Supported keys are `start_time`, `distance`, `moving_time`, `pace`, `average_hr`, `computed_load`, and `elevation_gain`.
- `page` and `page_size`: pagination, defaulting to page `1` and `50` rows.
