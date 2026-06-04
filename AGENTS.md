# AGENTS.md

## Project

Personal running tracker and progress monitoring web app.

## Stack

- Backend: Python, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Redis, RQ.
- Frontend: React, TypeScript, Vite.
- Tests: pytest for backend, Vitest for frontend.

## Working rules

- Keep V1 personal-use scope.
- Prefer clear, boring, maintainable code over clever abstractions.
- Do not hardcode secrets.
- Do not add paid services unless explicitly requested.
- Keep Strava tokens server-side only.
- Encrypt provider tokens at rest.
- Every backend endpoint must enforce owner authentication unless explicitly public.
- Every data query must be scoped to the owner user.
- Derived metrics must be transparent and documented.
- Run tests before marking a phase complete.
- Update README when commands, environment variables, or setup change.
- Each Python method/function must have a simple docstring describing what it does.
- After implementation, perform a full code review and rate the implementation.
- During the first implementation prompt, show a technically detailed plan and a review/rating of that plan before editing.

