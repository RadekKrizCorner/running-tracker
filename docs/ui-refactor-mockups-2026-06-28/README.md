# Running Tracker UI Refactor Mock Frames

Date: 2026-06-28
Selected direction: 3 — `Training Brief`

These frames are the visual contract for the approved Running Tracker UI refactor. They extend the chosen dashboard direction across the most important desktop and mobile surfaces while preserving the existing integration-driven product model.

## Frames

1. `01-dashboard-desktop.png` — selected desktop Today/dashboard direction, 1440 × 1024.
2. `02-planning-desktop.png` — desktop Planning week view, 1440 × 1024.
3. `03-dashboard-mobile.png` — mobile Today/dashboard, 390 × 844.
4. `04-activities-mobile.png` — mobile Activities list, 390 × 844.

## Visual Contract

- Dark-pine grouped navigation and warm neutral content surfaces.
- Editorial hierarchy with one clear page-level message.
- Green for completed/positive state, blue for analysis, amber for planned training.
- Compact evidence tables and charts with visible labels and units.
- Lightweight separators and restrained elevation instead of nested card grids.
- Desktop and mobile are sibling compositions, not scaled copies.

## Functional Guardrails

- No `Start workout`, `Start run`, `Log activity`, `Quick add run`, live tracking, or manual activity creation.
- Completed activities are imported from integrations and identify their provenance, for example `Synced from Strava`.
- Planning remains editable through existing planning actions such as opening plan details, adding or editing a planned session, moving it, and saving changes.
- The mock frames are illustrative UI references; existing routes, API contracts, authentication, owner scoping, privacy behavior, metric explanations, and demo restrictions remain authoritative.
