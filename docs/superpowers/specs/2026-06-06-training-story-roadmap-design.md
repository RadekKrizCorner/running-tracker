# Training Story Roadmap Design

## Purpose

Build a three-feature roadmap that improves portfolio/demo impact and weekly training usefulness while keeping the project maintainable for personal V1 scope.

The roadmap must support parallel implementation by separate AI agents. Each feature should have clear ownership, additive contracts, and explicit integration gates so agents can produce one or more merge requests independently. The master process owns shared contracts, conflict resolution, final integration, and full validation.

## Roadmap Order

1. Instagram Report Builder
2. Event Readiness Dashboard
3. Route Explorer And Self-Hosted Route Suggestions

This order prioritizes visible training storytelling first, race-preparation usefulness second, and map/routing depth third.

## Feature 1: Instagram Report Builder

The report builder lets the owner create and manage multiple saved report templates, choose a template for a reporting period, prefill fields from app data, edit values and narrative copy, preview the result, and export a 9:16 Instagram-ready report.

### Scope

- Multiple saved templates.
- Template selection when generating a report.
- Structured editor only. No free drag-and-drop canvas editor in V1.
- Template fields for:
  - program name
  - title
  - week label
  - hero distance
  - main label and unit
  - completion percent
  - metric cards
  - planned vs actual volume
  - summary lines
  - wins
  - focus items
  - footer items
- Weekly prefill from owner-scoped plans, planned workouts, completed running activities, and weekly metrics.
- Manual editing after prefill.
- SVG preview and PNG/SVG export.
- The initial default template should be based on `/Users/radek/Downloads/maraton_report_template`.

### Out Of Scope

- Dragging/resizing arbitrary fields.
- Public sharing links.
- Multi-user template gallery.
- Paid rendering or design services.

## Feature 2: Event Readiness Dashboard

The event readiness dashboard upgrades event detail into a race-preparation cockpit. It helps the owner understand whether current training supports the target event.

### Scope

- Countdown and event phase.
- Target pace and target-time context.
- Recent 4-week volume and load.
- Longest recent run compared with event distance.
- Future planned distance, load, and session count through race day.
- Missed planned sessions.
- Intensity mix.
- Transparent guidance messages and suggested focus.
- Existing event notes remain editable.

### Rules

- Metrics must be transparent and documented.
- Language must stay non-medical.
- Owner authentication and owner-scoped queries are required.
- Prefer a dedicated readiness service/response instead of overloading generic event CRUD.

### Out Of Scope

- Injury prediction.
- Medical risk scoring.
- Coach/admin workflows.
- Third-party coaching integrations.

## Feature 3: Route Explorer And Self-Hosted Route Suggestions

Route Explorer combines previous GPS-route browsing with new loop-route generation. V1 route generation uses self-hosted routing infrastructure and Czech Republic map data if broader data is too heavy.

### Scope

- Browse previous owner GPS routes.
- Generate new loop-route suggestions from a starting point.
- Route preferences:
  - target distance
  - hill/elevation preference
  - road/trail/surface preference
  - loop route requirement
- Backend calls a local self-hosted routing service.
- V1 assumes Valhalla as the first routing provider.
- V1 routing data may be scoped to Czech Republic.
- Frontend previews generated candidates with MapLibre.
- App must continue working when routing infrastructure is disabled.

### Out Of Scope

- Global map data in V1.
- Paid routing APIs.
- Turn-by-turn mobile navigation.
- Uploading generated routes to Strava.
- Complex route clustering as a prerequisite for route generation.

## Parallel Agent Model

Each feature can be implemented by its own AI agent. Agents should start from an agreed integration baseline and keep edits inside their owned feature lane unless the master process approves shared-file changes.

### Agent A: Report Builder

Owns:

- report template and report draft models
- report template API routes
- report prefill service
- report rendering service
- report builder frontend feature hooks
- structured template editor UI
- report preview/export UI
- report builder tests and docs

Potential merge requests:

1. Backend template/report contracts and persistence.
2. Prefill and rendering service.
3. Frontend template editor and generation flow.

### Agent B: Event Readiness

Owns:

- event readiness service and schemas
- readiness API endpoint or focused guidance extension
- event readiness frontend components
- event detail cockpit integration
- readiness metric docs
- event readiness tests

Potential merge requests:

1. Backend readiness contract and metrics.
2. Frontend readiness cockpit.
3. Documentation and polish.

### Agent C: Route Planning

Owns:

- routing provider interface
- Valhalla client
- route suggestion API
- route explorer frontend feature hooks
- route suggestion UI and map previews
- optional routing infrastructure docs/manifests
- route planning tests

Potential merge requests:

1. Routing provider infrastructure and backend contract.
2. Route suggestion service and tests.
3. Frontend route explorer and candidate preview.

## Master Process Responsibilities

The master process must:

- define shared contracts before agents branch
- assign ownership boundaries
- review each agent merge request
- resolve shared-file conflicts
- coordinate Alembic migration ordering
- rebase branches when conflicts affect agent work
- run focused and full validation before integration
- perform final code review and implementation rating

## Shared Conflict Zones

Agents may propose changes to these files, but the master process applies or reconciles them:

- `frontend/src/app/router.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/lib/api/types.ts`
- `frontend/src/lib/i18n.tsx`
- `backend/app/api/router.py`
- Alembic migration files
- `README.md`
- `docs/*`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `infra/k8s/*`

## Architecture Boundaries

### Report Builder Lane

Report Builder should add feature-specific models, schemas, routes, services, frontend hooks, pages/components, and tests. It can read activity, planning, weekly metric, user, and preference data through service helpers or owner-scoped queries, but it should not own those modules.

### Event Readiness Lane

Event Readiness should extend event preparation behavior through a focused readiness service. It should reuse existing event/activity/planning data and avoid schema changes unless a durable readiness snapshot is explicitly needed.

### Route Planning Lane

Route Planning should put local routing behind a provider boundary. The frontend should call the app backend, not Valhalla directly. Routing should be optional and return clear unavailable-state responses when not configured.

## Data Flow

### Report Builder

1. Owner creates or edits a template.
2. Owner starts a report from a template and selects a week/date range.
3. Backend computes a prefill payload from plans and completed runs.
4. Frontend lets owner edit fields.
5. Backend renders SVG or PNG from the selected template and report values.

### Event Readiness

1. Owner opens event detail.
2. Frontend requests event readiness.
3. Backend calculates readiness metrics from event, recent activities, planned workouts, and preferences.
4. Frontend renders cockpit cards, trend context, and guidance messages.

### Route Suggestions

1. Owner enters a start point and preferences.
2. Backend validates request and checks routing provider availability.
3. Backend requests loop-route candidates from local routing provider.
4. Backend normalizes route geometry, distance, duration, elevation, and metadata.
5. Frontend renders candidates on MapLibre.

## Testing Strategy

Each feature must include focused backend and frontend tests where applicable.

Report Builder:

- template CRUD owner scoping
- prefill calculations
- rendering output shape
- frontend template selection/editing/export flow

Event Readiness:

- readiness calculations
- guidance boundaries
- owner scoping
- frontend cockpit rendering

Route Planning:

- route request validation
- routing provider unavailable behavior
- provider response normalization
- frontend candidate rendering

The master process runs the relevant feature tests for each merge request and broader backend/frontend validation before final integration.

## Documentation Strategy

Update docs when each feature changes user-facing behavior or setup:

- `README.md` for new commands, setup, and route-builder/report-builder usage.
- `docs/technical.md` for architecture/API additions.
- `docs/api.md` for new endpoints.
- `docs/metrics.md` for readiness metrics and report prefill derivations.
- `docs/privacy.md` if route suggestion, exports, stored report values, or routing infrastructure change privacy behavior.
- deployment docs for local Valhalla/Czech Republic routing data setup.

## Design Review

Rating: 8.5/10.

Strengths:

- Clear feature ownership supports parallel agents.
- Report Builder is high portfolio value and grounded in an existing template.
- Event Readiness reuses existing event preparation work.
- Route Suggestions are scoped to self-hosted, optional infrastructure and Czech Republic data.

Risks:

- Report Builder can grow into a general design tool if structured-editor constraints are not enforced.
- Route Suggestions are operationally heavier than the other features because of routing data and provider setup.
- Shared frontend files and migration ordering require active master-process coordination.

The design is ready for implementation planning once the written spec is reviewed and accepted.
