# Activities UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver responsive activity browsing and detail surfaces while preserving integration-only activity creation, filters, pagination, maps, streams, splits, zones, notes, and gear.

**Architecture:** Reuse existing activity query hooks and detail route. Render one desktop table and one purpose-built mobile list from the same normalized row model; split the detail into focused sections without changing mutations or API types.

**Tech Stack:** React, TypeScript, TanStack Query, MapLibre, Recharts, Vitest, Testing Library.

---

### Task 1: Shared activity row model and mobile list

**Files:**
- Create: `frontend/src/components/activities/activityRow.ts`
- Create: `frontend/src/components/activities/ActivityDesktopTable.tsx`
- Create: `frontend/src/components/activities/ActivityMobileList.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add a test that renders activity name, date, intensity, distance, duration, pace, and provider provenance in a mobile list and asserts no add/log/start control exists.
- [ ] Run `npm test -- ActivitiesPage.test.tsx` and confirm failure because `activity-mobile-list` is absent.
- [ ] Implement `toActivityRow(activity)` as a pure mapping over the existing API response.
- [ ] Render the desktop table above 760 px and the semantic mobile list below it, keeping both accessible to tests but hiding the inactive presentation with CSS media queries.
- [ ] Preserve search, date/intensity filters, clear filters, result count, loading, errors, and load-more/pagination behavior.
- [ ] Run the focused tests and verify pass.

### Task 2: Activity detail composition

**Files:**
- Create: `frontend/src/components/activities/ActivitySummary.tsx`
- Create: `frontend/src/components/activities/ActivityAnalysis.tsx`
- Create: `frontend/src/components/activities/ActivitySplits.tsx`
- Create: `frontend/src/components/activities/ActivityNotesGear.tsx`
- Modify: `frontend/src/pages/ActivityDetailPage.tsx`
- Modify: `frontend/src/pages/ActivityDetailPage.test.tsx`

- [ ] Extend detail tests to assert summary, map/streams, splits/zones, notes, and gear remain present and notes remain editable only when permitted.
- [ ] Run `npm test -- ActivityDetailPage.test.tsx` and verify failure for the new section labels/test ids.
- [ ] Extract focused components while keeping current chart helpers exported from `ActivityDetailPage.tsx` until their existing tests can import a stable path.
- [ ] Keep map and stream highlighting synchronized and keep estimated/summary metric caveats visible.
- [ ] Run focused tests and verify pass.

### Task 3: Activities visual and responsive QA

**Files:**
- Modify: `frontend/src/styles/components.css`
- Modify: `frontend/src/styles/layout.css`
- Create: `docs/ui-refactor-implementation/activities-fidelity.md`

- [ ] Match the 390 × 844 list to `04-activities-mobile.png`: open list container, row separators, 14–16 px body type, fixed bottom nav clearance, and no horizontal overflow.
- [ ] Verify desktop filter/table density at 1440 × 1024 and keyboard focus order.
- [ ] Run `npm test -- ActivitiesPage.test.tsx ActivityDetailPage.test.tsx`, then full `npm test` and `npm run build`.
- [ ] Record and fix all P0–P2 fidelity issues.
