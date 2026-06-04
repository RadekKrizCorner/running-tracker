# Kubernetes Operations And Data Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operations guide for the local Kubernetes cluster and import the previous Docker Compose Postgres data into the Kubernetes Postgres database.

**Architecture:** Use existing Kubernetes resources and local Docker volume data. Import is performed with `pg_dump` from the old Docker volume, `pg_dump` backup of current Kubernetes state, `pg_restore --clean` into `postgres-0`, and a migration Job rerun before app pods resume.

**Tech Stack:** Kubernetes, kind, kubectl, Docker, PostgreSQL `pg_dump`/`pg_restore`, Kustomize, Helm for optional Headlamp UI.

---

### Task 1: Inspect Current State

**Files:**
- Read: `docker-compose.yml`
- Read: `infra/k8s/overlays/local/kustomization.yaml`

- [ ] **Step 1: Confirm Kubernetes context**

Run:

```bash
kubectl config current-context
kubectl get nodes
```

Expected: context is `kind-running-tracker` and the node is `Ready`.

- [ ] **Step 2: Confirm old Docker data source**

Run:

```bash
docker volume ls --format '{{.Name}}' | rg 'newproject_postgres_data'
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | rg 'newproject-db|postgres|running-tracker'
```

Expected: `newproject_postgres_data` exists. The old DB container may be absent.

### Task 2: Backup And Import Database

**Files:**
- Create ignored runtime files under `.local-backups/`

- [ ] **Step 1: Create dump files**

Run:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".local-backups/db-import-$STAMP"
mkdir -p "$BACKUP_DIR"
docker run -d --name running-tracker-old-db-dump -e POSTGRES_USER=running -e POSTGRES_PASSWORD=running -e POSTGRES_DB=running_tracker -v newproject_postgres_data:/var/lib/postgresql/data postgres:16-alpine
until docker exec running-tracker-old-db-dump pg_isready -U running -d running_tracker; do sleep 1; done
docker exec running-tracker-old-db-dump pg_dump -U running -d running_tracker -Fc > "$BACKUP_DIR/docker-running-tracker.dump"
kubectl -n running-tracker exec postgres-0 -- sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/kubernetes-before-import.dump"
```

- [ ] **Step 2: Restore Docker dump**

Run:

```bash
kubectl -n running-tracker scale deployment/running-tracker-api deployment/running-tracker-worker deployment/running-tracker-scheduler --replicas=0
kubectl -n running-tracker exec -i postgres-0 -- sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_DIR/docker-running-tracker.dump"
kubectl -n running-tracker delete job running-tracker-migrate --ignore-not-found
kubectl apply -k infra/k8s/overlays/local
kubectl -n running-tracker wait --for=condition=complete job/running-tracker-migrate --timeout=240s
kubectl -n running-tracker wait --for=condition=Available deployment/running-tracker-api --timeout=240s
kubectl -n running-tracker wait --for=condition=Available deployment/running-tracker-worker --timeout=240s
kubectl -n running-tracker wait --for=condition=Available deployment/running-tracker-scheduler --timeout=240s
docker rm -f running-tracker-old-db-dump
```

- [ ] **Step 3: Verify row counts and health**

Run:

```bash
kubectl -n running-tracker exec postgres-0 -- sh -c 'for t in $(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select tablename from pg_tables where schemaname = '\''public'\'' order by tablename"); do c=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"$t\""); printf "%s=%s\n" "$t" "$c"; done'
kubectl -n running-tracker port-forward svc/running-tracker-api 18009:8009
curl http://127.0.0.1:18009/health
```

Expected: imported row counts match the Docker source and health returns `{"status":"ok"}`.

### Task 3: Add Operations Guide

**Files:**
- Create: `docs/deployment/kubernetes-operations.md`
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Document cluster inventory and state commands**

Add commands for contexts, nodes, pods, deployments, services, PVCs, jobs, logs, rollout status, and describe.

- [ ] **Step 2: Document UI options**

Add options for `k9s`, in-cluster Headlamp, and Headlamp Desktop with local-only security notes.

- [ ] **Step 3: Document common operations**

Add commands for port-forwarding, restarts, scaling, migrations, config/secret changes, image rebuild/redeploy, backups, restore, Docker volume import, reset, and cluster deletion.

- [ ] **Step 4: Link the guide**

Add the operations guide to the README documentation list and ignore `.local-backups/`.

### Task 4: Review

**Files:**
- Review: `docs/deployment/kubernetes-operations.md`
- Review: `.gitignore`
- Review: `README.md`

- [ ] **Step 1: Validate guide commands against current cluster**

Run representative `kubectl get`, logs, health, and row-count commands.

- [ ] **Step 2: Check project invariants**

Verify secrets are not printed or tracked, Strava tokens remain server-side, no owner auth/query logic changed, and no Python docstring changes are needed.
