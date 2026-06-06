# Instagram Report Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multiple saved structured report templates, weekly data prefill, editable report values, SVG/PNG preview/export, and a Reports UI flow.

**Architecture:** Add a report-builder backend lane with template/report persistence, owner-scoped FastAPI routes, a prefill service that reads existing plans and activities, and a renderer derived from the existing weekly report service plus the external marathon template. Add a frontend feature module under Reports for template selection, structured editing, report generation, preview, and export.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic, CairoSVG, React, TypeScript, TanStack Query, Vitest, pytest.

---

## Ownership

Agent A owns report-builder files and tests. Shared files may be modified in the agent branch for local tests, but the final merge of shared files is master-owned.

Owned backend files:

- Create: `backend/app/models/report.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/report.py`
- Create: `backend/app/services/report_template_service.py`
- Create: `backend/app/services/report_prefill_service.py`
- Create: `backend/app/services/report_render_service.py`
- Create: `backend/app/api/routes/reports.py`
- Create: `backend/alembic/versions/202606060001_report_builder.py`
- Create: `backend/app/tests/test_report_builder.py`

Owned frontend files:

- Create: `frontend/src/features/reports/api.ts`
- Create: `frontend/src/components/reports/ReportTemplateEditor.tsx`
- Create: `frontend/src/components/reports/ReportGenerator.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Create: `frontend/src/pages/ReportsPage.report-builder.test.tsx`

Shared integration files:

- `backend/app/api/router.py`
- `frontend/src/lib/api/types.ts`
- `frontend/src/lib/i18n.tsx`
- `README.md`
- `docs/api.md`
- `docs/technical.md`
- `docs/privacy.md`

## Data Model

Create `report_templates`:

- `id` UUID primary key
- `user_id` UUID indexed foreign key to users
- `name` string, required
- `description` text nullable
- `format` string default `instagram_story`
- `theme` JSON required
- `sections` JSON required
- `field_defaults` JSON required
- `is_default` boolean default false
- timestamps

Create `generated_reports`:

- `id` UUID primary key
- `user_id` UUID indexed foreign key to users
- `template_id` UUID nullable foreign key to report_templates
- `title` string required
- `period_start` date required
- `period_end` date required
- `values` JSON required
- `created_at`, `updated_at`

Use cascade behavior only for owner-owned report data. Do not store rendered binary blobs in V1.

## Backend Tasks

### Task 1: Add Report Builder Models And Migration

**Files:**

- Create: `backend/app/models/report.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/202606060001_report_builder.py`
- Test: `backend/app/tests/test_migrations.py`

- [ ] **Step 1: Write migration expectation**

Add `202606060001_report_builder` to the migration revision list in `backend/app/tests/test_migrations.py` if that test enumerates revisions. If the test only upgrades head, do not change it.

- [ ] **Step 2: Create SQLAlchemy models**

Implement `ReportTemplate` and `GeneratedReport` with simple class docstrings. Use SQLAlchemy JSON columns for `theme`, `sections`, `field_defaults`, and `values`.

- [ ] **Step 3: Export models**

Add imports to `backend/app/models/__init__.py` so Alembic metadata sees the new tables.

- [ ] **Step 4: Create Alembic migration**

Create `backend/alembic/versions/202606060001_report_builder.py` with:

```python
"""Add report builder tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "202606060001"
down_revision = "202606040001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create report builder tables."""
    op.create_table(
        "report_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("format", sa.String(length=64), nullable=False, server_default="instagram_story"),
        sa.Column("theme", sa.JSON(), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("field_defaults", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_report_templates_user_id", "report_templates", ["user_id"])
    op.create_table(
        "generated_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("template_id", sa.Uuid(), sa.ForeignKey("report_templates.id"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_generated_reports_user_id", "generated_reports", ["user_id"])


def downgrade() -> None:
    """Drop report builder tables."""
    op.drop_index("ix_generated_reports_user_id", table_name="generated_reports")
    op.drop_table("generated_reports")
    op.drop_index("ix_report_templates_user_id", table_name="report_templates")
    op.drop_table("report_templates")
```

- [ ] **Step 5: Run migration test**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_migrations.py -q
```

Expected: migration tests pass.

### Task 2: Add Schemas And Template Service

**Files:**

- Create: `backend/app/schemas/report.py`
- Create: `backend/app/services/report_template_service.py`
- Test: `backend/app/tests/test_report_builder.py`

- [ ] **Step 1: Write failing owner-scoped template test**

Add tests that create two users, create a template for one user, and assert the other user cannot read it through the service.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py::test_report_template_lookup_is_owner_scoped -q
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement Pydantic schemas**

Create schemas:

- `ReportTemplateCreate`
- `ReportTemplateUpdate`
- `ReportTemplateRead`
- `GeneratedReportCreate`
- `GeneratedReportRead`
- `ReportPrefillResponse`
- `ReportRenderRequest`

Every class must have a simple docstring.

- [ ] **Step 4: Implement template service**

Add service functions:

- `default_report_template_payload()`
- `ensure_default_report_template(session, user_id)`
- `get_report_template_for_user(session, user_id, template_id)`
- `list_report_templates(session, user_id)`
- `create_report_template(session, user_id, payload)`
- `update_report_template(session, template, payload)`
- `delete_report_template(session, template)`

Every Python function must have a simple docstring.

- [ ] **Step 5: Run service tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py -q
```

Expected: service tests pass.

### Task 3: Add Prefill Service

**Files:**

- Create: `backend/app/services/report_prefill_service.py`
- Test: `backend/app/tests/test_report_builder.py`

- [ ] **Step 1: Write failing prefill test**

Create a user, two planned workouts in a week, two completed running activities in the same owner-local week, and assert `build_weekly_report_prefill` returns:

- actual distance
- planned distance
- actual run count
- planned training count excluding rest
- total moving time
- longest run
- average pace
- completion percent
- default summary/wins/focus arrays

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py::test_weekly_report_prefill_uses_owner_week_data -q
```

Expected: FAIL because prefill service does not exist.

- [ ] **Step 3: Implement prefill service**

Create `build_weekly_report_prefill(session, user, week_start_date)` and helper functions. Reuse existing weekly-report calculations where practical, but return editable JSON values matching the external template structure:

```python
{
    "program": "MARATONSKÁ PŘÍPRAVA",
    "title": "Týdenní běžecký report",
    "week": "Týden N",
    "main_distance": "25,4",
    "main_unit": "km",
    "completion_percent": 55,
    "stats": {
        "runs": "3",
        "time": "3 h 06 min",
        "plan_vs_actual": "46,0 / 25,4 km",
        "longest_run": "9,0 km",
        "avg_pace": "7:20 min/km",
        "training_adherence": "3/5"
    },
    "volume": {"planned": 46.0, "actual": 25.4, "difference": -20.6},
    "summary_lines": [...],
    "went_well": [...],
    "focus_next": [...],
    "footer": [...]
}
```

- [ ] **Step 4: Run prefill tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py -q
```

Expected: report builder backend tests pass.

### Task 4: Add Renderer And Routes

**Files:**

- Create: `backend/app/services/report_render_service.py`
- Create: `backend/app/api/routes/reports.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/app/tests/test_report_builder.py`

- [ ] **Step 1: Write failing route tests**

Add API tests for:

- `GET /api/v1/report-templates`
- `POST /api/v1/report-templates`
- `POST /api/v1/reports/prefill`
- `POST /api/v1/reports/render.svg`
- `POST /api/v1/reports/render.png`
- demo user write rejection for template mutations

- [ ] **Step 2: Run route test to verify RED**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py::test_report_template_api_is_owner_scoped -q
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement renderer**

Port the external `generate_report.py` rendering logic into `report_render_service.py`. Keep it data-driven and add simple docstrings to every function. Use `CairoSVG` for PNG conversion, matching the existing `weekly_report_service.py` pattern.

- [ ] **Step 4: Implement routes**

Add `APIRouter(prefix="/report-templates", tags=["reports"])` and `APIRouter(prefix="/reports", tags=["reports"])` or one route module with both prefixes. Use `CurrentUser` for reads and `WritableUser` for mutations/renders if generated report saving is included.

- [ ] **Step 5: Register routes**

Modify `backend/app/api/router.py` locally so tests pass. Mark this as a shared conflict zone in the final summary.

- [ ] **Step 6: Run backend report tests**

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py -q
```

Expected: report builder backend tests pass.

## Frontend Tasks

### Task 5: Add Report API Hooks And Types

**Files:**

- Create: `frontend/src/features/reports/api.ts`
- Modify: `frontend/src/lib/api/types.ts`
- Test: `frontend/src/pages/ReportsPage.report-builder.test.tsx`

- [ ] **Step 1: Write failing frontend hook usage test**

Test that `ReportsPage` calls report template list and renders template names.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd frontend
npm test -- ReportsPage.report-builder.test.tsx
```

Expected: FAIL because hooks/UI do not exist.

- [ ] **Step 3: Add TypeScript types**

Add types for `ReportTemplate`, `ReportTemplatePayload`, `GeneratedReport`, `ReportPrefillResponse`, and `ReportRenderPayload`.

- [ ] **Step 4: Add hooks**

Implement:

- `useReportTemplates`
- `useCreateReportTemplate`
- `useUpdateReportTemplate`
- `useDeleteReportTemplate`
- `useReportPrefill`
- `renderReportDownloadUrl` or `useRenderReport`

- [ ] **Step 5: Run hook/UI tests**

Run:

```bash
cd frontend
npm test -- ReportsPage.report-builder.test.tsx
```

Expected: test passes.

### Task 6: Add Structured Editor And Generator UI

**Files:**

- Create: `frontend/src/components/reports/ReportTemplateEditor.tsx`
- Create: `frontend/src/components/reports/ReportGenerator.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/lib/i18n.tsx`
- Test: `frontend/src/pages/ReportsPage.report-builder.test.tsx`

- [ ] **Step 1: Write failing editor test**

Test:

- user can choose a template
- user can click prefill
- fields populate
- preview iframe/object receives SVG
- export link uses render endpoint

- [ ] **Step 2: Implement structured editor**

Implement forms for template metadata and structured field defaults. Keep layout consistent with existing Reports page cards.

- [ ] **Step 3: Implement generator**

Add week selector, template selector, prefill button, editable values, preview, and export buttons.

- [ ] **Step 4: Add translations**

Add visible strings to Czech and English sections in `frontend/src/lib/i18n.tsx`.

- [ ] **Step 5: Run frontend tests and build**

Run:

```bash
cd frontend
npm test -- ReportsPage.report-builder.test.tsx
npm run build
```

Expected: focused report-builder test and build pass.

## Documentation Tasks

- [ ] Update `docs/api.md` with report template and report render endpoints.
- [ ] Update `docs/technical.md` with report builder models/services/frontend structure.
- [ ] Update `docs/privacy.md` to state generated report values are owner-local and exports do not include provider tokens.
- [ ] Update `README.md` with Report Builder usage if commands or user-facing behavior changed.

## Final Validation

Run:

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_report_builder.py app/tests/test_weekly_reports.py app/tests/test_demo_account.py -q
cd ../frontend
npm test -- ReportsPage.report-builder.test.tsx ReportsPage.test.tsx
npm run build
```

Expected: all selected backend tests, selected frontend tests, and build pass.

## Stop Conditions

Stop and ask the master process before:

- changing existing weekly-report API behavior
- changing shared navigation behavior
- changing unrelated analytics calculations
- adding a paid service
- storing rendered PNG blobs in the database
