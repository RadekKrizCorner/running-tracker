# Full Code Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create complete high-level and technical documentation for the running tracker codebase.

**Architecture:** Documentation is source-driven and split by audience. `docs/high-level.md` explains product behavior and user workflows. `docs/technical.md` explains backend, frontend, data, API, jobs, integrations, operations, tests, and known technical boundaries.

**Tech Stack:** Markdown documentation for a FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis/RQ, React, TypeScript, Vite, TanStack Query, Recharts, and MapLibre application.

---

### Task 1: Codebase Inventory

**Files:**
- Read: `backend/app/**/*.py`
- Read: `backend/alembic/versions/*.py`
- Read: `frontend/src/**/*.{ts,tsx}`
- Read: `docker-compose.yml`
- Read: `docker-compose.prod.yml`
- Read: `.env.example`
- Read: `README.md`

- [x] **Step 1: Identify relevant source files**

Run:

```bash
rg --files -g '!backend/.venv/**' -g '!frontend/node_modules/**' -g '!**/__pycache__/**' -g '!*.pyc'
```

Expected: repository source files without generated dependency directories.

- [x] **Step 2: Extract backend surface area**

Run:

```bash
rg -n "^(class|def|async def) |^@router\\.|api_router\\.include_router" backend/app
```

Expected: FastAPI routes, SQLAlchemy models, services, analytics helpers, providers, and jobs.

- [x] **Step 3: Extract frontend surface area**

Run:

```bash
rg -n "export function|function |useQuery|useMutation|Route path" frontend/src
```

Expected: React pages, shell, components, API hooks, utilities, and tests.

### Task 2: High-Level Documentation

**Files:**
- Create: `docs/high-level.md`

- [ ] **Step 1: Write product overview**

Document the single-owner running tracker purpose, main user outcomes, and privacy posture.

- [ ] **Step 2: Write user workflow coverage**

Document first run setup, Strava connection, activity review, dashboard, planning, calendar, events, trends, heatmap, settings, export, and deletion.

- [ ] **Step 3: Write non-goals and V1 boundaries**

Document personal-use scope, no Garmin direct API, no Strava webhooks, no paid services, and no multi-user/admin model.

### Task 3: Technical Documentation

**Files:**
- Create: `docs/technical.md`

- [ ] **Step 1: Write architecture map**

Document FastAPI app startup, router composition, cookie auth, database session handling, PostgreSQL, Redis/RQ, scheduler, and React/Vite frontend.

- [ ] **Step 2: Write backend module catalog**

Document `core`, `db`, `models`, `schemas`, `api/routes`, `services`, `analytics`, `providers`, `jobs`, tests, and Alembic.

- [ ] **Step 3: Write data model documentation**

Document every application model and the main relationships: users, activities, streams, notes, gear, events, plans, workouts, preferences, HR zones, provider connections, metrics, notifications, and calendar events.

- [ ] **Step 4: Write API endpoint inventory**

Document every route group under `/api/v1`, the auth requirements, and what each endpoint does.

- [ ] **Step 5: Write frontend module catalog**

Document route tree, pages, TanStack Query hooks, shared UI, charts, maps, i18n, formatting, date utilities, and environment variables.

- [ ] **Step 6: Write operational documentation**

Document Docker Compose services, local commands, migrations, seed cleanup, worker, scheduler, environment variables, tests, and production compose behavior.

### Task 4: Documentation Index

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add documentation section**

Add links to high-level, technical, API, metrics, privacy, deployment, and decision docs.

### Task 5: Review and Verification

**Files:**
- Read: `docs/high-level.md`
- Read: `docs/technical.md`
- Read: `README.md`

- [ ] **Step 1: Verify source references**

Run:

```bash
rg -n "high-level|technical|/api/v1|Strava|RQ|MapLibre" docs README.md
```

Expected: new documents and README links are discoverable.

- [ ] **Step 2: Review changes**

Run:

```bash
git diff -- docs README.md
```

Expected: documentation-only changes with no accidental source edits.

- [ ] **Step 3: Rate implementation**

Provide a full review, residual risks, and an implementation rating.
