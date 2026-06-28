# Tools, Settings, Public Surfaces, and Final QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the UI refactor across maps, reports, settings, and public surfaces, then prove functional and visual parity for the whole application.

**Architecture:** Keep current MapLibre, report API, profile/settings hooks, auth routes, and public asset pipeline. Recompose each page around the shared design system and remove legacy CSS only after route-level parity passes.

**Tech Stack:** React, TypeScript, TanStack Query, MapLibre, Recharts, Vite, Vitest, Testing Library, Browser/IAB.

---

### Task 1: Map-first Heatmap and Routes

**Files:**
- Modify: `frontend/src/pages/HeatmapPage.tsx`
- Modify: `frontend/src/pages/RouteExplorerPage.tsx`
- Modify: `frontend/src/components/maps/RunHeatmap.tsx`
- Modify: `frontend/src/components/maps/RouteCandidateMap.tsx`
- Modify: `frontend/src/pages/HeatmapPage.test.tsx`
- Modify: `frontend/src/pages/RouteExplorerPage.test.tsx`

- [ ] Add tests for map-first ordering, filter/parameter panels, results, errors, empty states, and existing route actions.
- [ ] Run focused tests and verify ordering assertions fail.
- [ ] Recompose pages with the map as the primary surface and a responsive control drawer/rail.
- [ ] Preserve map sources, privacy behavior, request parameters, and candidate interactions.
- [ ] Run focused tests and verify pass.

### Task 2: Report hub and stepped builder

**Files:**
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/components/reports/ReportGenerator.tsx`
- Modify: `frontend/src/components/reports/ReportTemplateEditor.tsx`
- Modify: `frontend/src/pages/ReportsPage.test.tsx`
- Modify: `frontend/src/pages/ReportsPage.report-builder.test.tsx`

- [ ] Add tests for report task entry, builder steps, template/draft save and update, preview stability, and export.
- [ ] Run focused tests and verify stepped-builder and no-scroll assertions fail.
- [ ] Implement explicit `Content / Appearance / Preview / Export` progression while keeping existing form and API payloads.
- [ ] Keep desktop preview sticky and mobile preview full-screen; never move document focus or scroll on preview updates.
- [ ] Run focused tests and verify pass.

### Task 3: Settings and public surfaces

**Files:**
- Create: `frontend/src/components/settings/SettingsNavigation.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/SettingsPage.test.tsx`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/SetupPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add tests for settings sections, URL/deep-link behavior, integrations, privacy/export/delete, profile/preferences, demo summaries, login, and setup.
- [ ] Run focused tests and verify section navigation assertions fail.
- [ ] Implement desktop local section navigation and mobile select/accordion while preserving all existing mutations and confirmations.
- [ ] Align Landing/Login/Setup typography, controls, imagery, errors, and responsive spacing with the selected design system.
- [ ] Run focused tests and verify pass.

### Task 4: Legacy CSS removal and complete localization

**Files:**
- Create: `frontend/src/styles/pages.css`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Run `rg "className=" frontend/src` and map every active class to a layered stylesheet.
- [ ] Move remaining page-specific rules to `pages.css` without changing computed behavior.
- [ ] Remove superseded legacy rules only after the affected route test remains green.
- [ ] Verify every new visible key exists in both English and Czech.
- [ ] Run full frontend tests and build.

### Task 5: Full verification and code review

**Files:**
- Create: `design-qa.md`
- Create: `docs/ui-refactor-implementation/final-review.md`

- [ ] Run `npm test` and expect all frontend tests to pass.
- [ ] Run `npm run build` and expect a successful production build.
- [ ] Run `backend/.venv/bin/python -m pytest` (or the available project interpreter) and expect all backend tests to pass.
- [ ] Use Browser/IAB to exercise every protected and public route at desktop and mobile widths, including filters, tabs, drawers, forms, maps, report preview/export, settings mutations, and read-only demo states.
- [ ] Capture the four mock-target states at their native aspect ratios and compare source plus render with `view_image`.
- [ ] Write a fidelity ledger covering at least copy, layout, typography, palette, spacing/container model, icons, and responsive behavior; fix all P0/P1/P2 issues until `design-qa.md` says `final result: passed`.
- [ ] Review owner authentication/scoping, Strava token secrecy, metric transparency, Python docstrings, tests, documentation, and residual risks.
- [ ] Rate the final implementation out of 10 and record evidence in `final-review.md`.
