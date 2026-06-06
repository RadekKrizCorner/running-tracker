# Event Readiness Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transparent event readiness cockpit to event detail using existing event, activity, and planning data.

**Architecture:** Extend the event lane with a focused readiness schema, service, endpoint, and frontend panel. Reuse existing event preparation helpers where possible, keep metrics transparent, and avoid durable schema changes unless a tested requirement proves they are needed.

**Tech Stack:** FastAPI, SQLAlchemy 2, Pydantic, React, TypeScript, TanStack Query, Recharts when useful, pytest, Vitest.

---

## Ownership

Agent B owns event-readiness files and tests. Shared files may be modified in the agent branch for local tests, but the final merge of shared files is master-owned.

Owned backend files:

- Modify: `backend/app/schemas/event.py`
- Modify: `backend/app/services/event_service.py`
- Modify: `backend/app/api/routes/events.py`
- Create: `backend/app/tests/test_event_readiness.py`

Owned frontend files:

- Modify: `frontend/src/features/events/api.ts`
- Create: `frontend/src/components/events/EventReadinessPanel.tsx`
- Modify: `frontend/src/pages/EventDetailPage.tsx`
- Create: `frontend/src/pages/EventReadinessPanel.test.tsx`

Shared integration files:

- `frontend/src/lib/api/types.ts`
- `frontend/src/lib/i18n.tsx`
- `docs/metrics.md`
- `docs/api.md`
- `docs/technical.md`

## Readiness Contract

Add an event readiness response with:

- `event_id`
- `phase`
- `days_until_start`
- `target_pace_s_per_km`
- `recent_4w_distance_m`
- `recent_4w_load`
- `recent_4w_run_count`
- `longest_run_8w_m`
- `long_run_event_distance_ratio`
- `planned_distance_to_event_m`
- `planned_load_to_event`
- `planned_sessions_to_event`
- `missed_planned_sessions`
- `intensity_mix`
- `readiness_items`
- `guidance_messages`

Each readiness item should include:

- `key`
- `label`
- `value`
- `detail`
- `status`: `good`, `watch`, `missing`, or `neutral`

## Backend Tasks

### Task 1: Add Readiness Schemas

**Files:**

- Modify: `backend/app/schemas/event.py`
- Test: `backend/app/tests/test_event_readiness.py`

- [ ] **Step 1: Write failing schema import test**

Add a test that imports `EventReadiness` and validates a representative payload.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py::test_event_readiness_schema_accepts_transparent_items -q
```

Expected: FAIL because schema does not exist.

- [ ] **Step 3: Implement schemas**

Add Pydantic models:

- `EventReadinessIntensityMix`
- `EventReadinessItem`
- `EventReadiness`

Every Python class must have a simple docstring.

- [ ] **Step 4: Run schema test**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py::test_event_readiness_schema_accepts_transparent_items -q
```

Expected: PASS.

### Task 2: Add Readiness Service

**Files:**

- Modify: `backend/app/services/event_service.py`
- Test: `backend/app/tests/test_event_readiness.py`

- [ ] **Step 1: Write failing readiness calculation test**

Create a user, an event, recent activities, planned workouts, and missed workouts. Assert readiness includes:

- event phase
- target pace
- recent 4-week distance/load/run count
- longest 8-week run
- planned distance/load/session count to event
- missed session count
- intensity mix seconds
- at least four readiness items

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py::test_event_readiness_summarizes_training_context -q
```

Expected: FAIL because service function does not exist.

- [ ] **Step 3: Implement service function**

Add `event_readiness(session, user, event)` to `backend/app/services/event_service.py`. Reuse `calculate_event_preparation` and existing private helpers where possible. Add helper functions only when they keep calculations readable.

Every new Python function must have a simple docstring.

- [ ] **Step 4: Run readiness tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py -q
```

Expected: PASS.

### Task 3: Add Readiness API Endpoint

**Files:**

- Modify: `backend/app/api/routes/events.py`
- Test: `backend/app/tests/test_event_readiness.py`

- [ ] **Step 1: Write failing API test**

Test `GET /api/v1/events/{event_id}/readiness`:

- requires authentication
- returns owner-scoped readiness for the owner
- returns 404 for another owner's event

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py::test_event_readiness_endpoint_is_owner_scoped -q
```

Expected: FAIL because endpoint does not exist.

- [ ] **Step 3: Implement endpoint**

Add endpoint after event detail/guidance endpoints:

```python
@router.get("/{event_id}/readiness", response_model=EventReadiness)
def get_event_readiness(event_id: UUID, session: DbSession, user: CurrentUser) -> EventReadiness:
    """Return readiness metrics for one owner event."""
    event = get_event_for_user(session, user.id, event_id)
    return event_readiness(session, user, event)
```

- [ ] **Step 4: Run backend event tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py app/tests/test_events.py -q
```

Expected: PASS.

## Frontend Tasks

### Task 4: Add API Hook And Types

**Files:**

- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/features/events/api.ts`
- Test: `frontend/src/pages/EventReadinessPanel.test.tsx`

- [ ] **Step 1: Write failing hook rendering test**

Mock `/events/:id/readiness` and assert the panel renders readiness metrics.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd frontend
npm test -- EventReadinessPanel.test.tsx
```

Expected: FAIL because component/hook does not exist.

- [ ] **Step 3: Add TypeScript types**

Add:

- `EventReadinessIntensityMix`
- `EventReadinessItem`
- `EventReadiness`

- [ ] **Step 4: Add hook**

Add `useEventReadiness(eventId)` to `frontend/src/features/events/api.ts`.

### Task 5: Add Readiness Panel

**Files:**

- Create: `frontend/src/components/events/EventReadinessPanel.tsx`
- Modify: `frontend/src/pages/EventDetailPage.tsx`
- Modify: `frontend/src/lib/i18n.tsx`
- Test: `frontend/src/pages/EventReadinessPanel.test.tsx`

- [ ] **Step 1: Implement panel**

Render:

- countdown/phase header
- target pace card
- recent load/volume cards
- long-run readiness card
- future planned work card
- missed sessions card
- intensity mix
- guidance messages

- [ ] **Step 2: Integrate into Event Detail**

Add the panel near the top of `EventDetailPage`, after the event hero/summary and before editable details.

- [ ] **Step 3: Add translations**

Add English and Czech strings for all visible text.

- [ ] **Step 4: Run frontend tests and build**

Run:

```bash
cd frontend
npm test -- EventReadinessPanel.test.tsx EventDetailPage.test.tsx
npm run build
```

Expected: PASS.

## Documentation Tasks

- [ ] Update `docs/api.md` with `/events/{event_id}/readiness`.
- [ ] Update `docs/technical.md` with readiness service/API/frontend component.
- [ ] Update `docs/metrics.md` with readiness metric definitions and non-medical framing.

## Final Validation

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_event_readiness.py app/tests/test_events.py app/tests/test_calendar.py -q
cd ../frontend
npm test -- EventReadinessPanel.test.tsx EventDetailPage.test.tsx EventsPage.test.tsx
npm run build
```

Expected: selected backend tests, selected frontend tests, and build pass.

## Stop Conditions

Stop and ask the master process before:

- adding new persistent readiness tables
- changing existing event response fields in an incompatible way
- using medical or injury-risk language
- modifying route/navigation files outside event detail
