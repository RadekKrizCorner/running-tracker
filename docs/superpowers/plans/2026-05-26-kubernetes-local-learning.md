# Kubernetes Local Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Kubernetes learning path for Running Tracker using kind, Kustomize, generated secrets, and the existing Docker images.

**Architecture:** Mirror the current Compose topology in Kubernetes: Postgres, Redis, API, worker, scheduler, frontend, and a one-shot Alembic migration Job. Keep local-only values in an overlay so a future production overlay can use registry images, production URLs, ingress, and stronger secret management.

**Tech Stack:** Kubernetes manifests, Kustomize, kind, kubectl, Docker, FastAPI backend image, Nginx frontend image, PostgreSQL 16, Redis 7.

---

### Task 1: Add Kubernetes Manifests

**Files:**
- Create: `infra/k8s/base/kustomization.yaml`
- Create: `infra/k8s/base/postgres.yaml`
- Create: `infra/k8s/base/redis.yaml`
- Create: `infra/k8s/base/migrate-job.yaml`
- Create: `infra/k8s/base/api.yaml`
- Create: `infra/k8s/base/worker.yaml`
- Create: `infra/k8s/base/scheduler.yaml`
- Create: `infra/k8s/base/frontend.yaml`
- Create: `infra/k8s/overlays/local/kustomization.yaml`
- Create: `infra/k8s/overlays/local/namespace.yaml`
- Create: `infra/k8s/overlays/local/config.env`
- Create: `infra/k8s/overlays/local/secret.env.example`

- [ ] **Step 1: Create the base resources**

Create workload resources matching the existing `docker-compose.prod.yml` services. Use fixed service names `postgres`, `redis`, `running-tracker-api`, and `running-tracker-frontend` so app environment variables can resolve in-cluster DNS names.

- [ ] **Step 2: Add local overlay generators**

Create `running-tracker-config` from `config.env` and `running-tracker-secret` from ignored `secret.env`. Disable generator name suffix hashes so `envFrom` references stay easy to inspect while learning.

- [ ] **Step 3: Add migration gating**

Run Alembic in `running-tracker-migrate` and make API, worker, and scheduler init containers wait until the database Alembic heads match the image Alembic heads.

### Task 2: Add The Walkthrough

**Files:**
- Create: `docs/deployment/kubernetes-local.md`

- [ ] **Step 1: Document the Compose-to-Kubernetes mapping**

Add a table mapping `db`, `redis`, `api`, `worker`, `scheduler`, `frontend`, and migrations to their Kubernetes resources.

- [ ] **Step 2: Document local cluster setup**

Include exact commands for `kind create cluster`, Docker image builds, `kind load docker-image`, secret generation, `kubectl apply -k`, readiness waits, and port-forwarding.

- [ ] **Step 3: Document learning/debugging commands**

Include `kubectl get`, `kubectl logs`, `kubectl describe`, `kubectl exec`, rollout restart, namespace reset, and cluster deletion commands.

### Task 3: Link Documentation And Protect Secrets

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Link the Kubernetes walkthrough from README**

Add the local Kubernetes guide to the documentation list and mention it near the Compose setup.

- [ ] **Step 2: Ignore local Kubernetes secrets**

Add `infra/k8s/overlays/local/secret.env` to `.gitignore`.

### Task 4: Verify And Review

**Files:**
- Read: rendered Kustomize output

- [ ] **Step 1: Create a temporary `secret.env` for rendering**

Copy `secret.env.example` to `secret.env` and replace placeholder secret values with locally generated values.

- [ ] **Step 2: Render manifests**

Run:

```bash
kubectl kustomize infra/k8s/overlays/local
```

Expected: YAML renders without missing-file or schema errors.

- [ ] **Step 3: Remove temporary secrets if they were created only for validation**

Keep real local secrets ignored by Git. Do not print secret values in review output.

- [ ] **Step 4: Review implementation**

Check secret handling, owner-auth invariants, migration ordering, docs accuracy, Python docstring impact, and residual production risks. Rate the implementation out of 10.
