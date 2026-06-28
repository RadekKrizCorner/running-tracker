# UI Foundations, App Shell, and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the current interface and implement the selected `Training Brief` design system, responsive application shell, and Today-first dashboard without changing API contracts.

**Architecture:** Keep React Router and TanStack Query boundaries intact. Introduce focused layout/UI components and layered CSS files imported by `styles.css`; migrate the shell and dashboard first so legacy pages continue to render during the route-by-route refactor.

**Tech Stack:** React 19, TypeScript, Vite, React Router, TanStack Query, Vitest, Testing Library, Recharts, Lucide.

---

### Task 1: Critical regression coverage

**Files:**
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/pages/ReportsPage.report-builder.test.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.test.tsx`

- [ ] Add a shell test asserting grouped desktop navigation and the exact five mobile destinations.
- [ ] Run `npm test -- AppShell.test.tsx` and confirm the new assertions fail against the old flat navigation.
- [ ] Add a report test asserting preview updates never call `scrollIntoView`, `focus`, or `window.scrollTo`.
- [ ] Run `npm test -- ReportsPage.report-builder.test.tsx` and confirm the test fails for the current preview behavior.
- [ ] Add an Activities test asserting a semantic mobile list is present independently from the desktop table.
- [ ] Run `npm test -- ActivitiesPage.test.tsx` and confirm the mobile-list assertion fails.

### Task 2: Design tokens and shared primitives

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`
- Create: `frontend/src/styles/layout.css`
- Create: `frontend/src/styles/components.css`
- Modify: `frontend/src/styles.css`
- Create: `frontend/src/components/ui/QueryState.tsx`
- Create: `frontend/src/components/ui/SectionHeading.tsx`
- Create: `frontend/src/components/ui/StatRow.tsx`
- Test: `frontend/src/components/ui/QueryState.test.tsx`

- [ ] Write tests for loading, empty, error, and retry states in `QueryState.test.tsx`.
- [ ] Run `npm test -- QueryState.test.tsx` and verify failure because the component does not exist.
- [ ] Implement `QueryState` with `status`, `title`, `message`, and optional `onRetry`; use `role="status"` for loading/empty and `role="alert"` for errors.
- [ ] Define semantic tokens for pine navigation, warm neutral canvas, text, border, green success, blue analytical, amber planned, focus ring, spacing, radii, and motion.
- [ ] Import the four layered files from `styles.css`, retaining legacy rules below them until final cleanup.
- [ ] Run `npm test -- QueryState.test.tsx` and `npm run build` and verify both pass.

### Task 3: Responsive application shell

**Files:**
- Create: `frontend/src/components/layout/navigation.ts`
- Create: `frontend/src/components/layout/DesktopSidebar.tsx`
- Create: `frontend/src/components/layout/MobileNavigation.tsx`
- Create: `frontend/src/components/layout/MoreNavigationDrawer.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Define navigation groups `Today`, `Training`, `Progress`, `Tools`, `Account` and mobile destinations `Today`, `Plan`, `Activities`, `Progress`, `More` in `navigation.ts`.
- [ ] Run the shell test and verify it still fails for the expected grouped labels.
- [ ] Extract desktop and mobile navigation while keeping notification, avatar, locale, sidebar-collapse, demo, today-card, and logout behavior in `AppShell`.
- [ ] Make the desktop nav body independently scrollable and keep brand plus account controls reachable at 720 px height and 200% zoom.
- [ ] Implement the mobile More drawer with focus return, Escape close, backdrop close, and route-driven close.
- [ ] Add English and Czech translations for group labels and mobile Progress/More labels.
- [ ] Run `npm test -- AppShell.test.tsx` and verify all shell tests pass.

### Task 4: Today-first dashboard

**Files:**
- Create: `frontend/src/components/dashboard/TodayBrief.tsx`
- Create: `frontend/src/components/dashboard/WeekEvidence.tsx`
- Create: `frontend/src/components/dashboard/WeekAgenda.tsx`
- Create: `frontend/src/components/dashboard/RecentImportedActivity.tsx`
- Create: `frontend/src/components/dashboard/PriorityEvent.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.test.tsx`
- Modify: `frontend/src/lib/i18n.tsx`

- [ ] Add tests asserting the dashboard renders the current plan as information with `Open plan details`, renders imported provenance, and exposes no start/log/manual activity action.
- [ ] Run `npm test -- DashboardPage.test.tsx` and verify the new hierarchy assertions fail.
- [ ] Implement `TodayBrief` from existing dashboard and calendar queries; derive headline copy from planned-today and actual-vs-planned state without adding API fields.
- [ ] Implement evidence, agenda, recent activity, and priority event components using current data and transparent fallback/empty states.
- [ ] Preserve Strava connect/sync/history sync, onboarding, simple/advanced mode, chart access, and demo restrictions below the primary Today hierarchy.
- [ ] Add all new visible strings in Czech and English.
- [ ] Run `npm test -- DashboardPage.test.tsx` and verify pass.

### Task 5: Foundation verification

**Files:**
- Create: `docs/ui-refactor-implementation/foundation-fidelity.md`

- [ ] Run `npm test` and expect 0 failures.
- [ ] Run `npm run build` and expect a successful Vite build.
- [ ] Capture dashboard at 1440 × 1024 and 390 × 844 with the in-app Browser.
- [ ] Compare captures to `docs/ui-refactor-mockups-2026-06-28/01-dashboard-desktop.png` and `03-dashboard-mobile.png` with `view_image`.
- [ ] Record copy, layout, typography, palette, container, navigation, and responsive differences in the fidelity ledger; fix P0–P2 differences before continuing.
