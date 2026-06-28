# Calendar and Planning UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build readable Calendar and `Week / Outlook / Library` planning surfaces while preserving every planning mutation, preference, template, unscheduled item, drag/drop, and read-only demo rule.

**Architecture:** Keep the current plans feature hooks and form state. Extract view components from `PlansPage.tsx` around existing commands; completion remains derived from integration sync and cannot be changed manually.

**Tech Stack:** React, TypeScript, TanStack Query, Recharts, Vitest, Testing Library.

---

### Task 1: Calendar month/week and day detail

**Files:**
- Create: `frontend/src/components/calendar/CalendarToolbar.tsx`
- Create: `frontend/src/components/calendar/MonthCalendar.tsx`
- Create: `frontend/src/components/calendar/WeekAgenda.tsx`
- Create: `frontend/src/components/calendar/CalendarDayDrawer.tsx`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add tests for month/week switching, selected-day drawer, completed imported activities, planned sessions, rest, and keyboard day selection.
- [ ] Run the focused test and verify failure for the missing view switch.
- [ ] Implement month grid on desktop and agenda-first list on mobile from the existing calendar response.
- [ ] Implement a shared selected-day drawer with plan-detail navigation only; do not add completion controls.
- [ ] Run focused tests and verify pass.

### Task 2: Planning view shell and decomposition

**Files:**
- Create: `frontend/src/components/plans/PlanToolbar.tsx`
- Create: `frontend/src/components/plans/PlanSummary.tsx`
- Create: `frontend/src/components/plans/PlanWeekView.tsx`
- Create: `frontend/src/components/plans/PlanOutlookView.tsx`
- Create: `frontend/src/components/plans/PlanLibraryView.tsx`
- Create: `frontend/src/components/plans/PlannedSessionDrawer.tsx`
- Create: `frontend/src/components/plans/planView.ts`
- Modify: `frontend/src/pages/PlansPage.tsx`
- Modify: `frontend/src/pages/PlansPage.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add tests for exact view tabs, week summary, synced completed sessions, planned session editor, template library, unsaved state, save, move, delete, and demo read-only behavior.
- [ ] Run `npm test -- PlansPage.test.tsx` and verify the new tabs fail.
- [ ] Add URL-backed `view=week|outlook|library` parsing with `week` as the default and back/forward-safe updates.
- [ ] Extract components around current commands; do not duplicate mutation logic or query invalidation.
- [ ] Keep actual-versus-planned charts and 4/8/12-week outlook choices.
- [ ] Keep drag/drop and add buttons, plus an explicit Move-to control usable by keyboard and touch.
- [ ] Ensure completion text states that matching occurs after integration sync.
- [ ] Run focused tests and verify pass.

### Task 3: Planning fidelity and regression QA

**Files:**
- Modify: `frontend/src/styles/components.css`
- Modify: `frontend/src/styles/layout.css`
- Create: `docs/ui-refactor-implementation/planning-fidelity.md`

- [ ] Capture Plan at 1440 × 1024 and compare with `02-planning-desktop.png`.
- [ ] Verify sticky editor, seven-day schedule density, visible sidebar, mobile editor/drawer, and no clipped controls.
- [ ] Run `npm test -- CalendarPage.test.tsx PlansPage.test.tsx`, full `npm test`, and `npm run build`.
- [ ] Record and fix all P0–P2 fidelity issues.
