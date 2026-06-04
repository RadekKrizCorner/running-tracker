# Tasov Main Deployment

This app is prepared to run behind the `Tasov-Trainer-Main` nginx router at:

```text
https://mydomain.com/behame/
```

## Images

GitHub Actions builds and publishes:

```text
ghcr.io/<owner>/behame-api:latest
ghcr.io/<owner>/behame-frontend:latest
```

The worker uses the same `behame-api` image with a different command.

## Required GitHub Repository Setup

The local machine does not currently have the GitHub CLI installed, so create the GitHub repository manually or install `gh`.

Manual flow:

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git add .
git commit -m "initial running tracker app"
git branch -M main
git push -u origin main
```

The workflow uses `GITHUB_TOKEN` and publishes to GHCR. In GitHub package settings, make the package visible to the deployment host or log Docker into GHCR on the host.

## Tasov Main Changes

The target folder `/Users/radek/IdeaProjects/Tasov-Trainer-Main` now has:

- `behame_db`
- `behame_redis`
- `behame_api`
- `behame_worker`
- `behame_frontend`
- nginx routes for `/behame/` and `/behame/api/`

The nginx service mounts a tracked root-level config:

```text
./nginx-default.conf:/etc/nginx/conf.d/default.conf:ro
```

That avoids needing to rebuild the existing `trainerapp_nginx_routing` image just to add the `/behame/` route.

Add the `BEHAME_*` values from `.env_template` into the real `.env` on the deployment host.

The target compose file currently points to:

```text
ghcr.io/emoholcicka/behame-api:latest
ghcr.io/emoholcicka/behame-frontend:latest
```

If the new repository is created under a different GitHub owner, update those image names in the target compose file.

For Strava, use this callback URL:

```text
https://mydomain.com/behame/api/v1/connections/strava/callback
```

## Frontend Subpath

The frontend production image is built with:

```text
VITE_BASE_PATH=/behame/
VITE_API_BASE_URL=/behame/api/v1
```

The frontend nginx container rewrites `/behame/*` to the static build root while React Router uses `/behame` as its basename.
