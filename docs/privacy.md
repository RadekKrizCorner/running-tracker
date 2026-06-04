# Privacy

Running Tracker is private by default and intended for one owner.

Sensitive local data includes:

- GPS tracks and map polylines.
- Activity timestamps.
- Heart-rate streams.
- Pain, soreness, sleep, fatigue, and free-text notes.
- OAuth tokens.

Provider tokens are encrypted with an authenticated application secret before storage and are never sent to the frontend. Logs must not include passwords, access tokens, refresh tokens, or full GPS tracks.

Export includes profile, provider connection metadata without tokens, activities, notes, gear, planned workouts, weekly metrics CSV, and activity CSV.

Account deletion removes local app data only. It does not delete activities from Strava.
