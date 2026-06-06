# Route Explorer And Route Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route browsing and self-hosted loop-route suggestions from a starting point with distance, hill, and surface preferences.

**Architecture:** Add a route-planning lane with a provider interface, a Valhalla client, request/response normalization, owner-authenticated API routes, and a MapLibre frontend. Routing infrastructure is optional; when not configured, the app returns a clear unavailable response and the frontend shows setup guidance.

**Tech Stack:** FastAPI, SQLAlchemy 2, httpx, Pydantic, React, TypeScript, TanStack Query, MapLibre, pytest, Vitest, Docker Compose, Kubernetes manifests.

---

## Ownership

Agent C owns route-planning files and tests. Shared files may be modified in the agent branch for local tests, but the final merge of shared files is master-owned.

Owned backend files:

- Create: `backend/app/providers/routing/__init__.py`
- Create: `backend/app/providers/routing/valhalla.py`
- Create: `backend/app/services/route_planning_service.py`
- Create: `backend/app/schemas/route_planning.py`
- Create: `backend/app/api/routes/route_planning.py`
- Create: `backend/app/tests/test_route_planning.py`
- Modify: `backend/app/core/config.py`

Owned frontend files:

- Create: `frontend/src/features/routes/api.ts`
- Create: `frontend/src/components/maps/RouteCandidateMap.tsx`
- Create: `frontend/src/pages/RouteExplorerPage.tsx`
- Create: `frontend/src/pages/RouteExplorerPage.test.tsx`

Shared integration files:

- `backend/app/api/router.py`
- `frontend/src/app/router.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/lib/api/types.ts`
- `frontend/src/lib/i18n.tsx`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `infra/k8s/*`
- `README.md`
- `docs/deployment/*`
- `docs/api.md`
- `docs/technical.md`
- `docs/privacy.md`

## Backend Contract

Add `POST /api/v1/routes/suggest-loop`.

Request:

- `start_lat`
- `start_lng`
- `target_distance_m`
- `distance_tolerance_m`
- `hill_preference`: `flat`, `balanced`, or `hilly`
- `surface_preference`: `road`, `mixed`, or `trail`
- `candidate_count`

Response:

- `status`: `ok` or `unavailable`
- `detail`
- `candidates`

Candidate:

- `id`
- `name`
- `distance_m`
- `duration_s`
- `elevation_gain_m`
- `geometry`
- `provider`
- `score`
- `warnings`

## Backend Tasks

### Task 1: Add Config And Schemas

**Files:**

- Modify: `backend/app/core/config.py`
- Create: `backend/app/schemas/route_planning.py`
- Test: `backend/app/tests/test_route_planning.py`

- [ ] **Step 1: Write failing schema/config test**

Test that route suggestion request validates bounded coordinates and rejects impossible target distances.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py::test_route_suggestion_request_validates_bounds -q
```

Expected: FAIL because schemas do not exist.

- [ ] **Step 3: Add settings**

Add to `Settings`:

- `routing_enabled: bool = False`
- `routing_provider: str = "valhalla"`
- `valhalla_base_url: str | None = None`
- `route_suggestion_max_distance_m: int = 50000`

Every new Python method/function must have a simple docstring. Settings fields do not need docstrings.

- [ ] **Step 4: Add Pydantic schemas**

Add:

- `RouteSuggestionRequest`
- `RouteCandidate`
- `RouteSuggestionResponse`

Use Pydantic validation for coordinate bounds and distance ranges.

- [ ] **Step 5: Run schema tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py::test_route_suggestion_request_validates_bounds -q
```

Expected: PASS.

### Task 2: Add Valhalla Provider Client

**Files:**

- Create: `backend/app/providers/routing/__init__.py`
- Create: `backend/app/providers/routing/valhalla.py`
- Test: `backend/app/tests/test_route_planning.py`

- [ ] **Step 1: Write failing provider normalization test**

Use a representative Valhalla-like JSON response and assert the client normalizes distance, duration, geometry, and warnings.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py::test_valhalla_response_normalizes_candidates -q
```

Expected: FAIL because provider client does not exist.

- [ ] **Step 3: Implement provider client**

Create functions:

- `build_valhalla_loop_payload(request)`
- `normalize_valhalla_response(payload)`
- `request_valhalla_loop_routes(base_url, request)`

Use `httpx`. Every function must have a simple docstring.

- [ ] **Step 4: Run provider tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py -q
```

Expected: provider tests pass.

### Task 3: Add Route Planning Service And API

**Files:**

- Create: `backend/app/services/route_planning_service.py`
- Create: `backend/app/api/routes/route_planning.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/app/tests/test_route_planning.py`

- [ ] **Step 1: Write failing unavailable API test**

Test that an authenticated request returns `status="unavailable"` with a useful detail when routing is disabled.

- [ ] **Step 2: Write failing owner-auth test**

Test unauthenticated requests are rejected.

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py::test_route_suggestion_returns_unavailable_when_disabled -q
```

Expected: FAIL because endpoint does not exist.

- [ ] **Step 4: Implement service**

Add `suggest_loop_routes(settings, request)` in `route_planning_service.py`. It should:

- return unavailable when `routing_enabled` is false
- return unavailable when Valhalla URL is missing
- call provider when enabled
- normalize candidates
- cap candidate count

- [ ] **Step 5: Implement route**

Add authenticated `POST /routes/suggest-loop` route using `CurrentUser`.

- [ ] **Step 6: Register route locally**

Modify `backend/app/api/router.py` locally so tests pass. Mark this as a shared conflict zone in the final summary.

- [ ] **Step 7: Run backend route tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py -q
```

Expected: PASS.

## Frontend Tasks

### Task 4: Add Route API Hooks And Candidate Map

**Files:**

- Create: `frontend/src/features/routes/api.ts`
- Modify: `frontend/src/lib/api/types.ts`
- Create: `frontend/src/components/maps/RouteCandidateMap.tsx`
- Test: `frontend/src/pages/RouteExplorerPage.test.tsx`

- [ ] **Step 1: Write failing map rendering test**

Test that a candidate with geometry renders a route map summary and candidate metrics.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd frontend
npm test -- RouteExplorerPage.test.tsx
```

Expected: FAIL because route explorer does not exist.

- [ ] **Step 3: Add TypeScript types and hook**

Add:

- `RouteSuggestionRequest`
- `RouteCandidate`
- `RouteSuggestionResponse`
- `useSuggestLoopRoute`

- [ ] **Step 4: Add candidate map component**

Use the same MapLibre style pattern as existing map components. Accept route geometry as `[lat, lng][]` and render one selected candidate.

### Task 5: Add Route Explorer Page

**Files:**

- Create: `frontend/src/pages/RouteExplorerPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/lib/i18n.tsx`
- Test: `frontend/src/pages/RouteExplorerPage.test.tsx`

- [ ] **Step 1: Implement form**

Fields:

- start latitude
- start longitude
- target distance
- hill preference
- surface preference
- candidate count

- [ ] **Step 2: Implement result states**

Render:

- loading
- unavailable setup state
- candidate list
- selected route map
- warnings

- [ ] **Step 3: Add route/nav locally**

Add `/routes` and a nav item locally so the page can be tested. Mark this as a shared conflict zone in the final summary.

- [ ] **Step 4: Add translations**

Add English and Czech visible strings.

- [ ] **Step 5: Run frontend tests and build**

Run:

```bash
cd frontend
npm test -- RouteExplorerPage.test.tsx
npm run build
```

Expected: PASS.

## Infrastructure And Documentation Tasks

- [ ] Add optional routing environment variables to `.env.example` if that file exists.
- [ ] Update `README.md` with optional routing setup and Czech Republic data scope.
- [ ] Update `docs/technical.md` with route planning architecture.
- [ ] Update `docs/api.md` with `/routes/suggest-loop`.
- [ ] Update `docs/privacy.md` to explain start-point and generated route handling.
- [ ] Add deployment notes for local Valhalla and Czech Republic data setup.

Do not add paid services. Keep route generation optional.

## Final Validation

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_route_planning.py app/tests/test_app_origins.py -q
cd ../frontend
npm test -- RouteExplorerPage.test.tsx
npm run build
```

Expected: selected backend tests, selected frontend tests, and build pass.

## Stop Conditions

Stop and ask the master process before:

- adding a paid routing API
- requiring routing infrastructure for app startup
- storing user start-point search history without explicit design approval
- adding global map data downloads
- changing existing heatmap behavior
