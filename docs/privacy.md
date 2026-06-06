# Privacy

Running Tracker is private by default and intended for one owner.

Sensitive local data includes:

- GPS tracks and map polylines.
- Activity timestamps.
- Heart-rate streams.
- Pain, soreness, sleep, fatigue, and free-text notes.
- OAuth tokens.

Provider tokens are encrypted with an authenticated application secret before storage and are never sent to the frontend. Logs must not include passwords, access tokens, refresh tokens, or full GPS tracks.

The optional portfolio demo account is a separate generated profile. Demo data may use safe owner aggregate patterns such as typical distance, duration, pace, and intensity ranges, but it must not copy provider tokens, real GPS tracks, private notes, real event details, or exact private training history. Demo routes are synthetic and placed around public city or landmark areas for visualization.

Demo sessions are read-only. The backend blocks demo writes, data export, account deletion, Strava actions, profile mutations, notification mutations, report template mutations, and saved report mutations with `DEMO_READ_ONLY`.

Export includes profile, provider connection metadata without tokens, activities, notes, gear, planned workouts, weekly metrics CSV, and activity CSV.

Report templates and saved report drafts are owner-local. Weekly report prefill reads owner-scoped plans, planned workouts, and completed running activities, then returns editable values to the frontend. SVG/PNG rendering accepts those values only and does not include provider tokens or store rendered binary files.

Account deletion removes local app data only. It does not delete activities from Strava.
