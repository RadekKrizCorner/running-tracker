# Running Tracker UI Refactor Design

Date: 2026-06-28  
Status: Approved design with selected visual direction 3 (`Training Brief`)
Related evidence: [`docs/ui-audit-2026-06-27/audit.md`](../../ui-audit-2026-06-27/audit.md)

## 1. Purpose

Refactor the complete Running Tracker user interface into a calm, modern training command center while preserving every existing user-facing capability, protected route, API contract, owner boundary, demo restriction, privacy invariant, and transparent metric definition.

This is a workflow-first frontend refactor. It is not a backend rewrite, not a feature expansion, and not a replacement for the existing React, TanStack Query, Recharts, or MapLibre stack.

## 2. Success Criteria

The refactor succeeds when:

1. Every existing route and workflow remains available.
2. The first dashboard viewport answers what to do today, how the current week is progressing, and what needs attention.
3. Desktop navigation remains fully accessible at a 720 px viewport height and at 200% zoom.
4. Mobile activities use a purpose-built list rather than a clipped desktop table.
5. Mobile calendar and planning use mobile-native structures instead of long one-column conversions of desktop grids.
6. Analytics present a clear reading path, keep important values visible without hover, and retain metric caveats.
7. Complex forms use progressive disclosure, stable preview behavior, and persistent save context.
8. Loading, empty, error, stale, pending, read-only, and success states are consistent.
9. English and Czech remain complete for all visible strings.
10. Relevant Vitest tests pass, the frontend production build succeeds, and browser QA covers desktop and mobile routes.

## 3. Non-Goals

- No change to authentication, session handling, owner scoping, or demo account permissions.
- No new paid service or third-party UI platform.
- No client-side exposure of Strava tokens or provider credentials.
- No change to load, intensity, readiness, adherence, or trend formulas.
- No replacement of Recharts or MapLibre unless an implementation phase proves a blocking limitation.
- No free-form report canvas, coaching AI, social feed, team workspace, or sharing expansion.
- No live workout tracking, `Start workout`, `Log activity`, or manual activity-creation flow. Completed activities enter through configured integrations such as Strava.
- No route-path migration or deletion of existing deep links.

## 4. Approved Product Direction

### 4.1 Design Character

The product should feel like a quiet training workspace: precise, calm, capable, and personal. It should avoid both generic SaaS dashboard styling and high-energy sports marketing inside the authenticated application.

The current identity remains recognizable:

- pine navigation and brand anchor;
- warm neutral application canvas;
- green primary actions and completed states;
- blue analytical focus and keyboard focus;
- amber future/planned states;
- red only for errors, destructive actions, or hard intensity where the existing metric meaning requires it.

### 4.2 Visual Rules

- Use spacing, alignment, typography, and grouping before borders.
- Do not put every section in a card.
- Do not nest cards unless the child is an independently actionable object.
- Use shadows only for overlays, sticky controls, and raised transient surfaces.
- Use one dominant action per screen or workflow step.
- Keep decorative runner imagery on the public landing page and meaningful empty states, not on every data page.
- Never encode status with color alone.

## 5. Information Architecture

Existing routes remain unchanged and are grouped as follows.

| Navigation group | Label | Existing route | Role |
| --- | --- | --- | --- |
| Overview | Today | `/dashboard` | Current day, current week, and next action |
| Training | Calendar | `/calendar` | Completed runs, planned workouts, custom events, and races by date |
| Training | Plan | `/plans` | Weekly editing, long-term outlook, templates, and workout pool |
| Training | Activities | `/activities` | Searchable and sortable running log |
| Progress | Trends | `/trends` | Volume, load, intensity, efficiency, consistency, and records |
| Progress | Events | `/events` | Races, goal events, preparation, and readiness |
| Tools | Heatmap | `/heatmap` | GPS route-density exploration |
| Tools | Routes | `/routes` | Loop-route generation and candidate review |
| Tools | Reports | `/reports` | Annual summary, weekly export, and report builder |
| Account | Settings | `/settings/*` | Profile, display, connections, metrics, data, and privacy |

Detail routes remain:

- `/activities/:activityId`
- `/events/:eventId`

### 5.1 Desktop Navigation

- Expanded sidebar target width: approximately 248 px.
- Collapsed rail target width: approximately 72 px.
- Group labels are visible in the expanded state.
- The navigation region scrolls independently when required.
- Profile, notifications, settings access, and collapse control remain reachable.
- The current sidebar `Today` card is removed; its content belongs on the dashboard.
- The collapsed rail provides accessible names and visible tooltips.
- The shell supports 200% zoom without hiding navigation items.

### 5.2 Mobile Navigation

Bottom navigation contains:

1. Today
2. Plan
3. Activities
4. Progress
5. More

`Plan` provides local navigation between Calendar, Week, and Outlook while preserving `/calendar` and `/plans`. `Progress` provides local navigation between Trends and Events. `More` contains Heatmap, Routes, Reports, Settings, and Logout.

The More sheet must include a visible close control, focus trap, Escape handling, focus return, background isolation for assistive technology, and safe-area padding.

## 6. Application Shell

### 6.1 Desktop Shell

- Persistent sidebar.
- Compact page command bar containing breadcrumb, page title, optional page description, and one primary action.
- Content width varies by task:
  - wide for tables, maps, planning, and charts;
  - medium for forms and settings;
  - reading width for explanatory content.
- Page-level actions remain sticky only when losing them would interrupt a long editing workflow.

### 6.2 Mobile Shell

- No desktop sidebar.
- Compact page header above content.
- Fixed bottom navigation with safe-area support.
- Content padding always accounts for bottom navigation and browser zoom.
- Primary page actions may use a sticky action bar when the page contains a long form.

### 6.3 Global Shell State

- Sidebar collapsed state stays in local storage.
- Locale and dashboard mode stay in owner preferences.
- Notifications retain current query and mutation behavior.
- Avatar controls retain current owner/demo rules.
- Route changes reset the main scroll region without stealing focus from the user.

## 7. Design System

### 7.1 Tokens

Tokens must use semantic roles rather than feature-specific color names.

Required token families:

- canvas, surface, surface-subtle, surface-emphasis;
- text-primary, text-secondary, text-disabled, text-inverse;
- border-subtle, border-strong;
- action-primary, action-primary-hover, action-secondary;
- focus-ring;
- state-success, state-warning, state-danger, state-info;
- data-primary, data-comparison, data-planned, data-neutral;
- intensity-easy, intensity-moderate, intensity-hard, intensity-unknown;
- spacing, radius, elevation, type scale, and motion duration.

The initial implementation should map these roles to the current palette before visually tuning values.

### 7.2 Typography and Spacing

- Keep Inter with the current system fallback stack.
- Body text defaults to 14–16 px.
- Headings use a consistent scale capped near 32 px inside the application.
- Use an 8 px spacing rhythm with 4 px half steps for compact controls.
- Interactive controls have a minimum target size of 44 × 44 px where space allows, and never below an accessible equivalent hit area.

### 7.3 Shared Components

The shared UI layer should include:

- `Button`
- `IconButton`
- `PageHeader`
- `SectionHeader`
- `PageCommandBar`
- `SummaryStrip`
- `MetricCard`
- `StatusPill`
- `InsightBanner`
- `SegmentedTabs`
- `FilterBar`
- `FilterDrawer`
- `ResponsiveDataList`
- `ChartPanel`
- `MapPanel`
- `Drawer`
- `Modal`
- `Sheet`
- `StickyActionBar`
- `QueryState`
- `EmptyState`
- `ReadOnlyState`

These components provide behavior and semantics, not only CSS classes. Overlay components own focus entry, focus trap, Escape, outside-click behavior when appropriate, and focus return.

## 8. Screen Specifications

### 8.1 Today / Dashboard

The dashboard reading order is:

1. Sync, data-quality, or setup alert when one needs action.
2. Today's planned workout, completed run, or recovery state.
3. Current-week progress against plan.
4. Seven-day agenda.
5. One interpreted training signal and next action.
6. Recent activity and nearest priority event.
7. Advanced analytical detail when advanced mode is active.

Simple mode shows the first six items with only essential metrics. Advanced mode adds load, intensity, readiness, and up to two priority charts. Neither mode hides errors, incomplete sync, or plan problems.

The onboarding checklist appears only while incomplete and can be collapsed. It does not occupy the primary dashboard position after the owner has usable data.

The Today workout panel is informational and planning-oriented. It may link to the existing planned-workout detail or Plan surface, but it must not offer `Start workout`, live tracking, or manual activity logging. Completion appears after an imported provider activity is synchronized and matched.

### 8.2 Calendar

Desktop month view uses a true seven-column calendar with weekday headers and compact event rows. Desktop week view uses a seven-day schedule. Selecting a day opens a right-side day drawer containing completed activities, planned workouts, custom events, goal events, and permitted actions.

Mobile defaults to a week agenda. Mobile month view uses a compact month grid with count/status markers and renders the selected day's agenda below it. It must not render 42 full-height day cards.

The toolbar keeps Previous, Today, Next, current date, and Week/Month control in one coherent region.

### 8.3 Planning

Planning has local views stored in URL state:

- Week
- Outlook
- Library

Week view shows seven days and all sessions. Mobile uses seven expandable day rows. Save state is persistent through a sticky action bar.

Outlook shows one actual-vs-planned visualization and compact week rows. Selecting a week reveals its day detail. It does not render twelve complete week grids simultaneously. Period choices are 4, 8, and 12 weeks where the existing data permits them.

Library combines workout templates and workout-pool items. Range lock and infrequent planning preferences move into Outlook settings.

Drag and drop remains available on pointer devices. Every draggable workout also provides a `Move to…` action usable by keyboard and touch.

### 8.4 Activities

Desktop default columns are:

- Date
- Name
- Distance
- Time
- Pace
- Intensity

Elevation, average HR, load, and other existing values are available through a column chooser. Search, intensity, date range, sort, and paging state are URL-backed. The filter bar shows applied filters and a clear action.

Mobile uses activity rows/cards. Each item shows date, name, intensity, distance, time, and pace. Secondary metrics are visible in expanded detail rather than through horizontal table scrolling.

### 8.5 Activity Detail

The header uses a summary strip for distance, moving time, pace, average HR, load, and elevation. Map and core stream insight form the first analytical row.

Content navigation provides:

- Overview
- Splits
- Heart-rate zones
- Notes and gear

The selected section is URL-backed. Mobile shows the map and primary metrics before deeper detail. Demo mode presents read-only notes and gear rather than editable-looking disabled controls.

### 8.6 Trends

The page owns a global period state:

- 12 weeks
- 6 months
- 1 year
- Custom

Analytical categories are:

- Volume
- Load
- Intensity
- Efficiency
- Consistency

Each category has one primary chart, a plain-language takeaway, supporting values, caveats, and an on-demand data table.

Preferred chart families:

- actual vs planned volume: grouped bars;
- weekly load vs baseline: bars plus baseline line;
- intensity time: stacked bars with direct labels and percentage summary;
- easy pace and HR: synchronized small multiples instead of an overloaded dual axis;
- adherence and consistency: compact trend plus explicit current value;
- records: ranked rows rather than a chart.

On mobile, reduce tick density and visible points before reducing type size. Tap and keyboard focus replace hover-only discovery.

### 8.7 Events

The list emphasizes the nearest priority event and presents remaining events as simpler comparison rows.

Event detail contains three primary layers:

1. Snapshot: countdown, distance, target time, target pace, and status.
2. Readiness: grouped `Good`, `Watch`, and `Next action` items.
3. Plan to event: planned sessions and volume until race day.

Course, poster, event facts, goal, fueling, gear, travel, and notes remain as secondary sections. A readiness metric is rendered once and referenced rather than duplicated in multiple panels.

### 8.8 Heatmap

The map is the dominant first-screen artifact. Period controls are placed above the map or in a compact overlay. Runs, samples, and cells form one summary line rather than three large KPI cards.

A text alternative describes the amount of source data and the strongest available density areas. The legend is visible without hover. Mobile uses a nearly full-width map and a filter sheet.

### 8.9 Route Explorer

The request prioritizes target distance, surface, hill preference, and candidate count. The current default start is summarized in one row; raw coordinates expand only when the start changes.

`Generate routes` remains visible without scrolling at standard desktop and mobile entry viewports.

Results contain a synchronized candidate list and map. Every candidate exposes distance, estimated duration, elevation, surface/provider caveats, and warnings in text. Mobile switches between map and list without losing selection.

### 8.10 Reports

The reports entry page offers three tasks:

- Annual overview
- Quick weekly export
- Instagram report builder

The report builder uses three steps:

1. Data
2. Style and copy
3. Review and export

Desktop keeps the editor left and a sticky 9:16 preview right. Mobile uses a stepper and a full-screen preview. Templates, saved drafts, save/update, and export are visually separated.

The preview iframe must have a descriptive title and must not autofocus or change scroll position when it loads or rerenders.

### 8.11 Settings

Settings sections are:

- Profile and display
- Connections
- Metrics and HR zones
- Data and privacy

Desktop uses local settings navigation. Mobile uses a settings index and detail surfaces. Demo mode renders concise read-only summaries instead of long disabled forms.

Account deletion stays isolated in a danger zone with explicit confirmation. Data export retains current token-exclusion behavior.

### 8.12 Landing and Authentication

The public landing page retains its current content and imagery but uses screenshots and component styling derived from the new application design. Login and setup gain a visible return path to the landing page and concise privacy/session reassurance.

## 9. Data Visualization Contract

### 9.1 Analytical Jobs

- Dashboard: explanatory monitoring and current-week comparison.
- Planning: actual-vs-planned time-series comparison.
- Trends: exploratory time change with explanatory takeaways.
- Event readiness: status and threshold context.
- Activity detail: route geography and stream change over time.
- Heatmap and route explorer: geospatial exploration.
- Reports: export-focused explanatory artifact.

### 9.2 Reading Path

Every analytical surface follows:

1. Insight title or direct question.
2. Immediate evidence.
3. Current value or comparison.
4. On-demand detail.
5. Caveat/source placement.

Essential values remain visible without hover. Legends are embedded or directly labeled where possible. Planned, completed, comparison, focus, and alert colors use separate semantic roles and are checked in grayscale and common color-deficiency modes.

### 9.3 Renderer Ownership

- Recharts owns standard cartesian charts.
- MapLibre owns route, heatmap, and candidate geography.
- HTML/CSS owns summaries, tables, legends, status rows, and accessible alternatives.
- No Canvas or WebGL layer is added outside MapLibre without a measured performance need.

## 10. Frontend Architecture

Target structure:

```text
src/
  app/
    navigation.ts
    router.tsx
  styles/
    tokens.css
    base.css
    layout.css
  components/
    layout/
    ui/
    charts/
    maps/
  features/
    dashboard/components/
    activities/components/
    calendar/components/
    plans/components/
    events/components/
    analytics/components/
    reports/components/
    routes/components/
    profile/components/
  pages/
    route-level composition only
```

Pages compose feature components and own route/search-param orchestration. Feature components receive typed data and callbacks. API access remains in `features/*/api.ts`. Presentational components do not call `apiRequest`.

No new global state library is added.

State ownership:

- TanStack Query: server state.
- URL search params: filters, period, paging, and selected analytical/planning section.
- Local React state: temporary forms, open overlays, and unsaved UI-only choices.
- Owner preferences: locale and dashboard mode.
- Local storage: sidebar collapsed state.

## 11. Query, Mutation, and Error Behavior

All migrated data surfaces implement:

- dimensionally stable skeletons;
- stale-but-visible content with last-updated context when relevant;
- retryable query errors;
- purposeful empty states;
- mutation-pending protection against duplicate submission;
- success feedback without unexpected navigation;
- preservation of form values after server errors;
- read-only demo presentation before the user attempts a mutation.

Mutations keep current API payloads and invalidate every affected query key. Unauthorized handling and login redirection remain unchanged.

## 12. Accessibility Requirements

- Visible `:focus-visible` system with sufficient contrast.
- Correct heading hierarchy and landmark structure.
- Skip link to main content.
- Minimum effective target size of 44 × 44 px for primary touch controls.
- Keyboard alternative for drag and drop.
- Focus management for all overlays.
- No color-only status.
- Reduced-motion support for all nonessential transitions.
- Accessible sorting state through `aria-sort`.
- Text summaries and data tables for charts.
- Text alternatives and synchronized lists for maps.
- Content reflow at 320 px and 200% zoom.
- Bottom safe-area handling on mobile.

Full WCAG 2.2 AA cannot be claimed until keyboard, screen-reader, contrast, zoom, and device testing are completed.

## 13. Testing Strategy

Every migrated route covers:

- owner and demo states;
- Czech and English;
- loading, populated, empty, error, stale, and pending states where applicable;
- simple and advanced dashboard modes where applicable;
- URL-backed filters and sections;
- keyboard interaction and overlay focus return;
- desktop, tablet, and mobile layout behavior;
- affected query invalidation;
- unchanged API payload shapes.

Implementation validation per phase:

```bash
cd frontend
npm test
npm run build
```

Browser QA viewports:

- 1280 × 720 desktop minimum audit viewport;
- 1440 × 1024 target desktop design viewport;
- representative tablet width;
- 390 × 844 mobile;
- 320 px minimum mobile width;
- 200% zoom on desktop content and navigation.

API contract changes, if any become demonstrably necessary, require backend pytest, frontend type updates, and API documentation updates. The default plan assumes none.

## 14. Migration Plan

### Phase 0: Critical Stabilization

- Stop report preview from changing focus or scroll.
- Make the desktop sidebar navigable at constrained height and zoom.
- Introduce a mobile activity-list presentation.

### Phase 1: Foundations

- Add semantic tokens, base styles, focus system, layout primitives, and query states.
- Build the new shell while retaining compatibility with old page markup.
- Introduce shared overlay behavior.

### Phase 2: Dashboard

- Implement Today-first hierarchy.
- Preserve sync, onboarding, plan comparison, simple/advanced mode, and recent/upcoming data.

### Phase 3: Activities

- Migrate filters and responsive list.
- Migrate activity detail, map, streams, splits, zones, notes, and gear.

### Phase 4: Calendar and Planning

- Implement month/week calendar and day drawer.
- Split planning into Week, Outlook, and Library.
- Add keyboard/touch move alternative.
- Decompose `PlansPage.tsx`.

### Phase 5: Progress

- Implement Trends period/category model.
- Simplify event list and detail hierarchy without removing readiness inputs or explanations.

### Phase 6: Tools and Settings

- Promote maps on Heatmap and Routes.
- Convert Reports into task entry plus stepped builder.
- Split Settings into local sections and demo summaries.

### Phase 7: Public Surfaces and Final QA

- Align landing previews and authentication surfaces.
- Complete localization, responsive, accessibility, and visual QA.
- Remove obsolete CSS and old components only after route parity.

Each phase ends in a functional, tested application. The migration is route-by-route, not a big-bang rewrite.

### Implementation Plan Boundaries

This design is a shared product and architecture contract, not one monolithic implementation plan. After written-spec approval, implementation planning must be split into these independently reviewable plans:

1. Critical stabilization, foundations, application shell, and dashboard.
2. Activities list and activity detail.
3. Calendar and planning.
4. Trends and events.
5. Heatmap, Route Explorer, Reports, Settings, public surfaces, and final QA.

Each plan must preserve compatibility with previously migrated routes, define its own focused test matrix, and finish with a working application before the next plan begins.

## 15. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| New and old CSS collide | Semantic tokens, scoped transition styles, route-by-route removal |
| Planning behavior regresses | Preserve hooks and payloads, extract components incrementally, expand focused tests first |
| Responsive patterns diverge across phases | Shared responsive primitives and browser QA matrix |
| Visual simplification hides metric meaning | Keep text explanations, caveats, and accessible data alternatives |
| Maps or report preview steal focus/scroll | Explicit focus ownership and regression tests |
| Demo appears editable | Read-only state at component and page level before mutation controls render |
| URL state breaks back navigation | Search-param helpers and route tests for filters/sections |
| Existing dirty branch complicates implementation | Keep commits phase-scoped and avoid unrelated files |

## 16. Mock Frame Plan

After this specification is accepted, generate exactly three independent visual directions grounded in the audit screenshots and this approved design system. Each direction should show the same representative Today/dashboard surface so hierarchy and styling can be compared fairly. The options vary layout strategy and emphasis while preserving the approved pine, warm-neutral, green/blue analytical direction.

Mock frames must not introduce `Start workout`, `Log activity`, `Quick add run`, live workout tracking, or manual activity creation. The only workout actions may navigate to existing planning details, and completed activity data is presented as integration-sourced.

After the user selects one direction, produce a consistent final mock set for at least:

- desktop Today/dashboard at 1440 × 1024;
- desktop Planning at 1440 × 1024;
- mobile Today/dashboard at 390 × 844;
- mobile Activities at 390 × 844.

The selected mock direction becomes the visual contract for implementation and browser design QA.

Selected direction: **3 — Training Brief**. It uses the dark-pine grouped navigation, warm neutral application surface, editorial Today headline, compact evidence tables, restrained green/blue data visualization, amber planned-workout treatment, and explicit `Synced from Strava` provenance. It does not expose manual workout start, live tracking, or activity creation.

Final mock artifacts live in [`docs/ui-refactor-mockups-2026-06-28/`](../../ui-refactor-mockups-2026-06-28/).

## 17. Design Review

Rating: 9/10.

Strengths:

- Preserves all functional, privacy, ownership, and metric contracts.
- Fixes information architecture instead of only reskinning pages.
- Treats mobile as a sibling surface.
- Decomposes the largest frontend files along workflow boundaries.
- Provides a phased path that keeps the application usable.

Residual risk:

- Planning and Report Builder are large, stateful surfaces with the highest regression potential.
- Complete accessibility conformance depends on implementation and assistive-technology testing.
- The selected visual contract still requires browser-based design QA during implementation so rendered screens match its hierarchy, density, and responsive behavior.
