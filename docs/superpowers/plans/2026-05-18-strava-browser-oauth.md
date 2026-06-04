# Strava Browser OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Strava connection feel like a browser authorization flow instead of a manual token workflow.

**Architecture:** Keep OAuth entirely server-side: the frontend links to the backend `/connections/strava/start`, the backend redirects to Strava, validates callback state, exchanges the code, encrypts tokens, and redirects back to Settings with a result query parameter. The frontend only renders status, actions, and user-readable callback results.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Vite, Vitest.

---

### Task 1: Backend OAuth Browser Flow

**Files:**
- Modify: `backend/app/providers/strava/client.py`
- Modify: `backend/app/api/routes/connections_strava.py`
- Test: `backend/app/tests/test_strava_oauth.py`

- [ ] **Step 1: Write failing backend tests**

Add tests covering `/start`, forced approval, successful callback, denied callback, invalid state redirect, and token exchange failure redirect. Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_strava_oauth.py -vv
```

Expected: new tests fail where forced approval and callback error redirects are not implemented.

- [ ] **Step 2: Implement minimal backend changes**

Allow `/start?force=true` to send `approval_prompt=force`; otherwise keep `approval_prompt=auto`. Convert browser callback failures into frontend redirects with clear `strava` result values and always delete the OAuth state cookie on terminal callback outcomes.

- [ ] **Step 3: Verify backend tests pass**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_strava_oauth.py -vv
```

Expected: all OAuth tests pass.

### Task 2: Settings UX

**Files:**
- Modify: `frontend/src/features/connections/api.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/lib/i18n.tsx`
- Test: `frontend/src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests for callback result messages and forced reauthorization when required scopes are missing. Run:

```bash
cd frontend
npm test -- SettingsPage.test.tsx --run
```

Expected: new UI tests fail before implementation.

- [ ] **Step 2: Implement minimal frontend changes**

Make `stravaConnectUrl` accept a force flag, show clear Settings messages for `strava=connected`, `denied`, `invalid_state`, and `error`, and use forced approval when scopes are missing.

- [ ] **Step 3: Verify frontend tests pass**

Run:

```bash
cd frontend
npm test -- SettingsPage.test.tsx --run
```

Expected: Settings tests pass.

### Task 3: Documentation and Regression

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Clarify that end users connect Strava through Settings in a browser and do not manually generate tokens. Keep the Strava API app configuration as an admin/setup step.

- [ ] **Step 2: Run targeted regression tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_strava_oauth.py app/tests/test_strava_sync.py -vv
cd ../frontend
npm test -- SettingsPage.test.tsx --run
```

Expected: targeted backend and frontend tests pass.

## Plan Self-Review

Coverage: the plan covers backend OAuth URL creation, callback persistence/error handling, frontend Settings feedback, and README setup wording.

Placeholder scan: no TBD/TODO placeholders remain.

Type consistency: backend uses existing FastAPI dependency and schema patterns; frontend keeps the existing API helper and Settings page structure.

Plan rating: 8/10. It is narrow, testable, and keeps tokens server-side. The main limitation is that Strava still requires a configured API application; this implementation can hide token handling from the app user, but it cannot remove Strava's app registration step for the app operator.
