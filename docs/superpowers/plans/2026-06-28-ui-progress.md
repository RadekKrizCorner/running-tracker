# Trends and Events UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clear analytical reading path for Trends and Events without changing metric definitions, readiness inputs, or event workflows.

**Architecture:** Preserve analytics/event hooks and chart helpers. Add category navigation and focused view components that expose units, caveats, legends, and non-hover values.

**Tech Stack:** React, TypeScript, TanStack Query, Recharts, Vitest, Testing Library.

---

### Task 1: Trends period and category model

**Files:**
- Create: `frontend/src/components/trends/TrendToolbar.tsx`
- Create: `frontend/src/components/trends/TrendSummary.tsx`
- Create: `frontend/src/components/trends/TrendCategoryView.tsx`
- Modify: `frontend/src/pages/TrendsPage.tsx`
- Modify: `frontend/src/pages/TrendsPage.test.tsx`
- Modify: `frontend/src/components/charts/TrendMetricCharts.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add tests for period controls, category selection, visible units, metric caveats, empty state, and accessible chart summaries.
- [ ] Run focused tests and verify failure for missing category navigation.
- [ ] Implement categories using existing metric series only; keep periods and URL state stable.
- [ ] Keep important current/average/change values outside chart hover tooltips.
- [ ] Run focused tests and verify pass.

### Task 2: Events list and detail hierarchy

**Files:**
- Create: `frontend/src/components/events/EventListRow.tsx`
- Create: `frontend/src/components/events/EventSummary.tsx`
- Create: `frontend/src/components/events/EventReadinessInputs.tsx`
- Modify: `frontend/src/pages/EventsPage.tsx`
- Modify: `frontend/src/pages/EventDetailPage.tsx`
- Modify: `frontend/src/pages/EventsPage.test.tsx`
- Modify: `frontend/src/pages/EventDetailPage.test.tsx`

- [ ] Add tests for priority state, countdown, distance/date, readiness inputs, explanations, edit/delete permissions, and demo behavior.
- [ ] Run event tests and verify failure for the new focused hierarchy.
- [ ] Implement open list rows and an event detail header that prioritizes countdown and readiness.
- [ ] Preserve all existing readiness calculations and explanatory copy; change presentation only.
- [ ] Run focused and full frontend tests, then `npm run build`.

### Task 3: Progress accessibility QA

**Files:**
- Create: `docs/ui-refactor-implementation/progress-fidelity.md`

- [ ] Verify charts have text alternatives, visible units, sufficient color contrast, and keyboard-operable period/category controls.
- [ ] Verify mobile charts do not overflow at 390 px and event controls remain reachable above bottom navigation.
- [ ] Record and fix all P0–P2 issues.
