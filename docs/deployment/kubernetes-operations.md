# Kubernetes Operations Guide

This guide covers day-to-day operation of the local `kind` cluster for Running Tracker.

## Cluster Basics

Use this context and namespace:

```bash
kubectl config use-context kind-running-tracker
kubectl config current-context
kubectl get nodes
```

```bash
export NS=running-tracker
```

The app runs these Kubernetes resources:

| Component | Resource | Purpose |
| --- | --- | --- |
| Postgres | `statefulset/postgres`, `pod/postgres-0`, `svc/postgres`, `pvc/postgres-data-postgres-0` | Main application database. |
| Redis | `deployment/redis`, `svc/redis` | RQ queue backend. |
| API | `deployment/running-tracker-api`, `svc/running-tracker-api` | FastAPI backend on port `8009`. |
| Worker | `deployment/running-tracker-worker` | Executes background jobs. |
| Scheduler | `deployment/running-tracker-scheduler` | Queues periodic Strava sync jobs. |
| Frontend | `deployment/running-tracker-frontend`, `svc/running-tracker-frontend` | Nginx static frontend on port `8080`. |
| Valhalla | `deployment/valhalla`, `svc/valhalla`, `pvc/valhalla-data` | Builds and serves Czech Republic routing tiles on port `8002`. |
| Migrations | `job/running-tracker-migrate` | Runs `alembic upgrade head`. |
| Config | `configmap/running-tracker-config` | Non-secret runtime settings. |
| Secrets | `secret/running-tracker-secret` | App secret, token key, DB password, owner email, Strava credentials. |

## Current State

Show everything important in the app namespace:

```bash
kubectl -n "$NS" get pods -o wide
kubectl -n "$NS" get deploy,sts,svc,pvc,job
kubectl -n "$NS" get configmap,secret
```

Show live CPU and memory usage:

```bash
kubectl top nodes
kubectl top pods -n "$NS"
```

Watch pods while starting or changing the app:

```bash
kubectl -n "$NS" get pods -w
```

Describe a failing pod:

```bash
kubectl -n "$NS" describe pod <pod-name>
```

Check rollout state:

```bash
kubectl -n "$NS" rollout status deployment/running-tracker-api
kubectl -n "$NS" rollout status deployment/running-tracker-worker
kubectl -n "$NS" rollout status deployment/running-tracker-scheduler
kubectl -n "$NS" rollout status deployment/running-tracker-frontend
kubectl -n "$NS" rollout status deployment/valhalla --timeout=3600s
```

## Open The App

Kubernetes keeps the app pods running in the background. The browser reaches
the local `kind` services through host-side port-forwards. Start or repair both
detached forwards from the repository root:

```bash
scripts/k8s-port-forwards.sh start
```

Check their status:

```bash
scripts/k8s-port-forwards.sh status
```

Stop them:

```bash
scripts/k8s-port-forwards.sh stop
```

Install the macOS LaunchAgent once if you want the forwards to start after login
and retry every minute until the local Kubernetes cluster is available:

```bash
scripts/k8s-port-forwards.sh install-launchd
```

The installer copies the helper to `~/Library/Application Support/running-tracker/`
before loading it, because LaunchAgents may not be allowed to execute files
directly from `~/Documents`.

The LaunchAgent writes logs to:

```text
~/Library/Logs/running-tracker/port-forwards.out.log
~/Library/Logs/running-tracker/port-forwards.err.log
```

Remove it with:

```bash
scripts/k8s-port-forwards.sh uninstall-launchd
```

Open:

```text
http://localhost:8080
```

Check API health:

```bash
curl http://localhost:8009/health
```

If the browser DevTools request shows `strict-origin-when-cross-origin`, first check whether the API port-forward is actually running. That text is the browser referrer policy, not the backend error by itself.

```bash
scripts/k8s-port-forwards.sh status
```

When the API port-forward is up, the login preflight should allow the frontend origin:

```bash
curl -i -X OPTIONS http://localhost:8009/api/v1/auth/login \
  -H 'Origin: http://localhost:8080' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

## Logs

Read the latest logs:

```bash
kubectl -n "$NS" logs deploy/running-tracker-api --tail=100
kubectl -n "$NS" logs deploy/running-tracker-worker --tail=100
kubectl -n "$NS" logs deploy/running-tracker-scheduler --tail=100
kubectl -n "$NS" logs deploy/running-tracker-frontend --tail=100
kubectl -n "$NS" logs deploy/valhalla --tail=100
kubectl -n "$NS" logs job/running-tracker-migrate --tail=100
```

Follow logs:

```bash
kubectl -n "$NS" logs deploy/running-tracker-api -f
```

Follow first-start Valhalla tile build logs:

```bash
kubectl -n "$NS" logs deploy/valhalla -f
kubectl -n "$NS" get pvc valhalla-data
```

The first Valhalla startup downloads the Czech Republic Geofabrik PBF and builds tiles into `pvc/valhalla-data`. Route suggestions can return provider-unavailable responses until that deployment is available. To force a clean rebuild:

```bash
kubectl -n "$NS" scale deployment/valhalla --replicas=0
kubectl -n "$NS" delete pvc valhalla-data
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" scale deployment/valhalla --replicas=1
```

## UI Options

### Metrics Server

Headlamp and `kubectl top` need Metrics Server to show CPU and memory usage. The local `kind` cluster needs `--kubelet-insecure-tls` because node kubelet certificates are self-signed for this learning environment.

Install or update Metrics Server:

```bash
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update metrics-server
helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --set 'args={--kubelet-insecure-tls}'
kubectl -n kube-system rollout status deployment/metrics-server
```

Verify metrics:

```bash
kubectl top nodes
kubectl top pods -n running-tracker
```

### Terminal UI: k9s

This is the fastest operational UI for local clusters.

```bash
brew install k9s
k9s --context kind-running-tracker -n running-tracker
```

Useful keys:

| Key | Action |
| --- | --- |
| `:pods` | Show pods. |
| `:deploy` | Show deployments. |
| `:svc` | Show services. |
| `l` | Logs for selected resource. |
| `d` | Describe selected resource. |
| `s` | Shell into selected pod. |
| `0` | Show all namespaces. |

### Browser UI: Headlamp

Headlamp is the web UI installed in this local cluster. It is exposed only through localhost port-forwarding.

Install or update it:

```bash
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm repo update headlamp
helm upgrade --install headlamp headlamp/headlamp \
  --namespace headlamp \
  --create-namespace
```

Create a local admin user for learning:

```bash
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: headlamp-admin
  namespace: headlamp
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: headlamp-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: headlamp-admin
    namespace: headlamp
YAML
```

Open Headlamp:

```bash
kubectl -n headlamp port-forward svc/headlamp 4466:80
```

Create a login token in another terminal:

```bash
kubectl -n headlamp create token headlamp-admin
```

Open:

```text
http://localhost:4466
```

Remove Headlamp when done:

```bash
helm uninstall headlamp -n headlamp
kubectl delete clusterrolebinding headlamp-admin --ignore-not-found
kubectl delete namespace headlamp --ignore-not-found
```

### Desktop UI: Headlamp Desktop

Headlamp reads your local kubeconfig and can connect to `kind-running-tracker`.

```bash
brew install --cask headlamp
open -a Headlamp
```

Select the `kind-running-tracker` cluster and the `running-tracker` namespace.

## Scaling Model

### API

The API is the safest service to scale horizontally.

```bash
kubectl -n "$NS" scale deployment/running-tracker-api --replicas=2
kubectl -n "$NS" get pods -l app.kubernetes.io/name=running-tracker-api -o wide
```

`svc/running-tracker-api` load-balances requests across all ready API pods. Authentication still works on every replica because the app uses a signed session token in the browser cookie. Each API pod reads the same `SECRET_KEY` from `running-tracker-secret`, so any replica can verify a token created by any other replica.

The API pods are stateless from Kubernetes' point of view. User state lives in Postgres, queue state lives in Redis, and auth state is in the signed cookie. If one API pod dies, Kubernetes starts another one and the Service routes traffic to the remaining ready pod while it recovers.

For this app, there are two ways to add API capacity:

```bash
# More Kubernetes pods.
kubectl -n "$NS" scale deployment/running-tracker-api --replicas=2
```

or change the API command/image to run multiple Uvicorn workers per pod. For Kubernetes, prefer more pods first because Kubernetes can observe, restart, and spread pods more clearly than it can manage worker processes inside one container.

### Worker

Workers scale horizontally by adding more consumers to the same Redis-backed RQ queue.

```bash
kubectl -n "$NS" scale deployment/running-tracker-worker --replicas=2
kubectl -n "$NS" logs deploy/running-tracker-worker --tail=50
```

Every worker connects to:

```text
redis://redis:6379/0
```

and listens to the same `running-tracker` queue. Adding a worker does not create a new queue; it creates another process that can reserve and execute queued jobs. Redis/RQ ensures a single queued job is claimed by one worker at a time.

The app also checks for an active Strava sync job for the owner before enqueueing another sync. That reduces duplicate sync risk, but with one personal owner and Strava rate limits, keep `running-tracker-worker` at `1` unless there is a real backlog.

### Scheduler

Do not scale the scheduler horizontally.

```bash
kubectl -n "$NS" scale deployment/running-tracker-scheduler --replicas=1
```

The scheduler loops and enqueues periodic Strava sync jobs. If two scheduler pods run without leader election or a distributed lock, both can wake up and try to enqueue the same kind of periodic work. The app checks for active jobs, but that is not a full scheduler leader-election design.

### Frontend

The frontend is static Nginx and is safe to scale.

```bash
kubectl -n "$NS" scale deployment/running-tracker-frontend --replicas=2
```

`svc/running-tracker-frontend` load-balances across frontend pods. For local `kind`, one replica is enough.

### Redis

Do not scale the current Redis Deployment with plain replicas.

```bash
# Do not use this as HA Redis.
kubectl -n "$NS" scale deployment/redis --replicas=2
```

Plain Redis replicas in Kubernetes would be independent Redis servers unless you add Redis replication and failover. The app expects one queue endpoint at `redis:6379`; two unrelated Redis pods behind one Service can split queue state and break RQ semantics.

For real Redis high availability, use one of these approaches:

- Redis Sentinel: one primary, one or more replicas, Sentinel processes that elect/promote a primary after failure. The app then needs a Sentinel-aware Redis URL/client setup or a stable proxy/service that always points at the primary.
- Redis Cluster: sharded Redis with multiple primaries. This is usually unnecessary for this app and not a natural fit for a simple RQ queue.
- Managed Redis: simplest production path if running outside a local lab.
- A Kubernetes Redis operator or Bitnami Redis chart in replication/Sentinel mode: better than hand-writing StatefulSets and failover scripts.

For this app, Redis is not expected to be the first bottleneck. Keep it single-instance locally.

### Postgres

Do not scale the current Postgres StatefulSet by setting `replicas: 2`.

```bash
# Do not use this as HA Postgres.
kubectl -n "$NS" scale statefulset/postgres --replicas=2
```

Postgres horizontal scaling needs a replication topology, not just more pods. If Postgres becomes the bottleneck, use this order:

1. Inspect query behavior first: slow queries, missing indexes, high connection count, large response payloads, or expensive analytics.
2. Tune the app: indexes, pagination, fewer repeated analytics recomputations, narrower queries, and caching where it is actually useful.
3. Increase resources for the current primary: more CPU, memory, and faster disk.
4. Add connection pooling with PgBouncer if connection count becomes the problem.
5. Add read replicas for read-heavy endpoints. The app would need read/write routing so writes go to primary and safe reads can use replicas.
6. Use a Postgres operator such as CloudNativePG, Zalando Postgres Operator, or CrunchyData PGO for local/cluster-managed HA.
7. Use managed Postgres for production if reliability matters more than learning the internals.

For the local personal tracker, a single Postgres pod is appropriate.

### Migration Job

The migration Job runs when the Kubernetes overlay is applied and the `running-tracker-migrate` Job does not already exist.

```bash
kubectl -n "$NS" delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" wait --for=condition=complete job/running-tracker-migrate --timeout=240s
```

It should run:

- On first install.
- After deploying backend code that includes new Alembic migrations.
- After restoring/importing a database backup.

It should not be scaled or run in parallel. API, worker, and scheduler pods have init containers that wait until the database Alembic heads match the backend image, so they do not become ready before migrations are complete.

## Common Operations

Restart the API:

```bash
kubectl -n "$NS" rollout restart deployment/running-tracker-api
kubectl -n "$NS" rollout status deployment/running-tracker-api
```

Restart app processes:

```bash
kubectl -n "$NS" rollout restart deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler
```

Scale app processes down for database maintenance:

```bash
kubectl -n "$NS" scale deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler --replicas=0
```

Scale them back up:

```bash
kubectl apply -k infra/k8s/overlays/local
```

Open a shell in the API pod:

```bash
kubectl -n "$NS" exec -it deploy/running-tracker-api -- sh
```

Open a SQL shell:

```bash
kubectl -n "$NS" exec -it postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Run migrations:

```bash
kubectl -n "$NS" delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" wait --for=condition=complete job/running-tracker-migrate --timeout=240s
```

Apply edited `config.env` or `secret.env` values:

```bash
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" rollout restart deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler
```

## Rebuild And Redeploy Local Images

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

kubectl -n "$NS" delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" wait --for=condition=complete job/running-tracker-migrate --timeout=240s
kubectl -n "$NS" rollout restart deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler deployment/running-tracker-frontend
```

## Database Backups

Create a timestamped Kubernetes backup:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".local-backups/k8s-$STAMP"
mkdir -p "$BACKUP_DIR"
kubectl -n "$NS" exec postgres-0 -- sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/running-tracker.dump"
ls -lh "$BACKUP_DIR"
```

Restore a backup into Kubernetes:

```bash
kubectl -n "$NS" scale deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler --replicas=0

kubectl -n "$NS" exec -i postgres-0 -- sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < .local-backups/k8s-YYYYMMDD-HHMMSS/running-tracker.dump

kubectl -n "$NS" delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" wait --for=condition=complete job/running-tracker-migrate --timeout=240s
kubectl -n "$NS" wait --for=condition=Available deployment/running-tracker-api --timeout=240s
```

## Docker Compose Data Import

Use this when the old Docker Compose database container is gone but the `newproject_postgres_data` volume still exists.

Create a dump from the Docker volume and backup the Kubernetes DB first:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".local-backups/db-import-$STAMP"
mkdir -p "$BACKUP_DIR"

docker rm -f running-tracker-old-db-dump >/dev/null 2>&1 || true
docker run -d --name running-tracker-old-db-dump \
  -e POSTGRES_USER=running \
  -e POSTGRES_PASSWORD=running \
  -e POSTGRES_DB=running_tracker \
  -v newproject_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine

until docker exec running-tracker-old-db-dump pg_isready -U running -d running_tracker; do sleep 1; done

docker exec running-tracker-old-db-dump pg_dump -U running -d running_tracker -Fc > "$BACKUP_DIR/docker-running-tracker.dump"
kubectl -n "$NS" exec postgres-0 -- sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/kubernetes-before-import.dump"
```

Restore the Docker dump into Kubernetes:

```bash
kubectl -n "$NS" scale deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler --replicas=0

kubectl -n "$NS" exec -i postgres-0 -- sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_DIR/docker-running-tracker.dump"

kubectl -n "$NS" delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n "$NS" wait --for=condition=complete job/running-tracker-migrate --timeout=240s
kubectl -n "$NS" wait --for=condition=Available deployment/running-tracker-api --timeout=240s
kubectl -n "$NS" wait --for=condition=Available deployment/running-tracker-worker --timeout=240s
kubectl -n "$NS" wait --for=condition=Available deployment/running-tracker-scheduler --timeout=240s

docker rm -f running-tracker-old-db-dump
```

Check row counts after import:

```bash
kubectl -n "$NS" exec postgres-0 -- sh -c 'for t in $(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select tablename from pg_tables where schemaname = '\''public'\'' order by tablename"); do c=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"$t\""); printf "%s=%s\n" "$t" "$c"; done'
```

## Reset Or Delete

Delete only this app:

```bash
kubectl delete namespace running-tracker
```

Delete the whole local cluster:

```bash
kind delete cluster --name running-tracker
```
