# Local Kubernetes Walkthrough

This guide moves the local Running Tracker stack from Docker Compose into a local Kubernetes cluster. It is designed for learning with `kind`, not for hosting valuable personal data on the internet.

## What Kubernetes Will Run

| Compose service | Kubernetes resource | Notes |
| --- | --- | --- |
| `db` | `postgres` `StatefulSet` + `Service` + PVC | Keeps Postgres data in a local persistent volume. |
| `redis` | `redis` `Deployment` + `Service` | Used by RQ jobs. |
| `api` | `running-tracker-api` `Deployment` + `Service` | Serves FastAPI on port `8009`. |
| `worker` | `running-tracker-worker` `Deployment` | Runs `python -m app.jobs.worker`. |
| `scheduler` | `running-tracker-scheduler` `Deployment` | Queues periodic Strava syncs. |
| `frontend` | `running-tracker-frontend` `Deployment` + `Service` | Serves the production Vite build through Nginx. |
| Valhalla | `valhalla` `Deployment` + `Service` + PVC | Builds and serves Czech Republic routing tiles from OpenStreetMap data. |
| `alembic upgrade head` | `running-tracker-migrate` `Job` | Runs database migrations before app pods become ready. |

The manifests live in:

```text
infra/k8s/base
infra/k8s/overlays/local
```

`base` defines the workloads. `overlays/local` defines local URLs, local image tags, namespace, and generated config/secrets.

## Prerequisites

```bash
docker --version
kind version
kubectl version --client
```

Install any missing tool before continuing.

## 1. Create A Local Cluster

From the repository root:

```bash
kind create cluster --name running-tracker
kubectl cluster-info --context kind-running-tracker
```

If the cluster already exists:

```bash
kind get clusters
kubectl config use-context kind-running-tracker
```

## 2. Build Local Images

The browser runs outside the cluster, so the frontend must be built with the API URL that your browser can reach through port-forwarding:

```bash
docker build -t running-tracker-backend:local ./backend

docker build \
  --build-arg VITE_API_BASE_URL=http://localhost:8009/api/v1 \
  --build-arg VITE_BASE_PATH=/ \
  -t running-tracker-frontend:local \
  -f frontend/Dockerfile.prod \
  ./frontend
```

Load both images into the kind node:

```bash
kind load docker-image running-tracker-backend:local --name running-tracker
kind load docker-image running-tracker-frontend:local --name running-tracker
```

## 3. Create Local Secrets

The committed `secret.env.example` file is only a template. Create the ignored real file:

```bash
python3 - <<'PY'
from base64 import urlsafe_b64encode
from os import urandom
from pathlib import Path
import secrets

db_password = secrets.token_urlsafe(24)
secret_key = secrets.token_urlsafe(48)
fernet_key = urlsafe_b64encode(urandom(32)).decode()

Path("infra/k8s/overlays/local/secret.env").write_text(
    "\n".join(
        [
            f"SECRET_KEY={secret_key}",
            f"TOKEN_ENCRYPTION_KEY={fernet_key}",
            "OWNER_EMAIL=you@example.com",
            f"DATABASE_URL=postgresql+psycopg://running:{db_password}@postgres:5432/running_tracker",
            "POSTGRES_USER=running",
            f"POSTGRES_PASSWORD={db_password}",
            "POSTGRES_DB=running_tracker",
            "STRAVA_CLIENT_ID=replace-me",
            "STRAVA_CLIENT_SECRET=replace-me",
            "",
        ]
    )
)
PY
```

Edit `infra/k8s/overlays/local/secret.env` and set:

- `OWNER_EMAIL`
- `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`, if you want to test Strava OAuth
- Routing defaults are non-secret and live in `infra/k8s/overlays/local/config.env`. If your existing ignored `secret.env` contains routing keys, keep `ROUTING_PROVIDER=valhalla` and `VALHALLA_BASE_URL=http://valhalla:8002` there too, or remove those overrides.

For local Kubernetes, the Strava callback URL is:

```text
http://localhost:8009/api/v1/connections/strava/callback
```

Route suggestions are enabled in the local overlay with `ROUTING_PROVIDER=valhalla` and `VALHALLA_BASE_URL=http://valhalla:8002`. The local overlay runs Valhalla in the cluster, downloads the Czech Republic Geofabrik PBF, and builds routing tiles into the `valhalla-data` PVC. The backend rejects start points outside the configured `ROUTE_SUGGESTION_MIN/MAX_LAT/LNG` bounds, which default to the Czech Republic.

The first Valhalla startup can take many minutes while it downloads `czech-republic-latest.osm.pbf` and builds tiles. Keep several GiB of free local disk available for the `kind` volume. Later starts reuse the PVC. Use `local_demo` only when explicitly testing or demoing approximate routes that are not snapped to roads or trails.

## 4. Render And Apply Manifests

Render the final Kubernetes YAML first:

```bash
kubectl kustomize infra/k8s/overlays/local
```

Apply it:

```bash
kubectl apply -k infra/k8s/overlays/local
```

Wait for the database and migrations:

```bash
kubectl -n running-tracker wait \
  --for=condition=Ready pod \
  -l app.kubernetes.io/name=postgres \
  --timeout=180s

kubectl -n running-tracker wait \
  --for=condition=complete job/running-tracker-migrate \
  --timeout=240s
```

Wait for the app:

```bash
kubectl -n running-tracker wait \
  --for=condition=Available deployment/valhalla \
  --timeout=3600s

kubectl -n running-tracker wait \
  --for=condition=Available deployment/running-tracker-api \
  --timeout=240s

kubectl -n running-tracker wait \
  --for=condition=Available deployment/running-tracker-worker \
  --timeout=240s

kubectl -n running-tracker wait \
  --for=condition=Available deployment/running-tracker-scheduler \
  --timeout=240s

kubectl -n running-tracker wait \
  --for=condition=Available deployment/running-tracker-frontend \
  --timeout=240s
```

Check what Kubernetes created:

```bash
kubectl -n running-tracker get all
kubectl -n running-tracker get pvc
```

## 5. Open The App

Kubernetes keeps the pods running in the background. The browser still needs local
ports that forward to the cluster services. Start both detached forwards from the
repository root:

```bash
scripts/k8s-port-forwards.sh start
```

Check them later:

```bash
scripts/k8s-port-forwards.sh status
```

On macOS, install a LaunchAgent if you want the forwards to start after login and
retry every minute until the local Kubernetes cluster is available:

```bash
scripts/k8s-port-forwards.sh install-launchd
```

The installer copies the helper to `~/Library/Application Support/running-tracker/`
before loading it, because LaunchAgents may not be allowed to execute files
directly from `~/Documents`.

Remove that LaunchAgent later with:

```bash
scripts/k8s-port-forwards.sh uninstall-launchd
```

Open:

```text
http://localhost:8080
```

API health:

```text
http://localhost:8009/health
```

## 6. Seed Sample Data

After the API deployment is ready:

```bash
kubectl -n running-tracker exec deploy/running-tracker-api -- python -m app.db.seed_dev
```

Default seed password:

```text
passwordpassword
```

Remove deterministic seed data later:

```bash
kubectl -n running-tracker exec deploy/running-tracker-api -- python -m app.db.cleanup_seed
```

## Useful Kubernetes Commands

Watch pods start:

```bash
kubectl -n running-tracker get pods -w
```

Read logs:

```bash
kubectl -n running-tracker logs deploy/valhalla
kubectl -n running-tracker logs deploy/running-tracker-api
kubectl -n running-tracker logs deploy/running-tracker-worker
kubectl -n running-tracker logs deploy/running-tracker-scheduler
kubectl -n running-tracker logs job/running-tracker-migrate
```

Inspect a failing pod:

```bash
kubectl -n running-tracker describe pods -l app.kubernetes.io/name=running-tracker-api
```

Open a shell in the API container:

```bash
kubectl -n running-tracker exec -it deploy/running-tracker-api -- sh
```

Check Valhalla during first tile build:

```bash
kubectl -n running-tracker logs deploy/valhalla -f
kubectl -n running-tracker get pvc valhalla-data
```

Apply edited `config.env` or `secret.env` values:

```bash
kubectl apply -k infra/k8s/overlays/local
kubectl -n running-tracker rollout restart deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler
```

Rebuild and redeploy after app changes:

```bash
docker build -t running-tracker-backend:local ./backend
docker build \
  --build-arg VITE_API_BASE_URL=http://localhost:8009/api/v1 \
  --build-arg VITE_BASE_PATH=/ \
  -t running-tracker-frontend:local \
  -f frontend/Dockerfile.prod \
  ./frontend

kind load docker-image running-tracker-backend:local --name running-tracker
kind load docker-image running-tracker-frontend:local --name running-tracker

kubectl -n running-tracker delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n running-tracker wait --for=condition=complete job/running-tracker-migrate --timeout=240s
kubectl -n running-tracker rollout restart deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler deployment/running-tracker-frontend
```

Reset only this app:

```bash
kubectl delete namespace running-tracker
```

Reset only Valhalla routing data:

```bash
kubectl -n running-tracker scale deployment/valhalla --replicas=0
kubectl -n running-tracker delete pvc valhalla-data
kubectl apply -k infra/k8s/overlays/local
kubectl -n running-tracker scale deployment/valhalla --replicas=1
```

Delete the whole local cluster:

```bash
kind delete cluster --name running-tracker
```

## Production Hardening Later

Do not treat this local setup as production. Before hosting real personal data, add:

- Managed or externally backed-up Postgres.
- Redis persistence or a clear policy that queued jobs are disposable.
- Immutable image tags from a registry such as GHCR.
- Ingress, HTTPS, stable DNS, and production callback URLs.
- Encrypted secret management such as SOPS, Sealed Secrets, or an external secrets controller.
- Database backup and restore drills.
- Explicit release steps for migrations.
- Resource tuning based on real usage.
