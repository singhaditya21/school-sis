# Reporting / Analytics / BI Architecture

School SIS now has a governed BI layer that sits above the existing reports, analytics pages, exports, and Core SIS domain events. The goal is to stop every dashboard from inventing its own data contract and to make reporting tenant-safe by design.

## Implemented Controls

- **Semantic catalog:** canonical datasets, dimensions, metrics, dashboards, and export policies live in `packages/api/src/analytics/bi`.
- **Secured API:** `GET /api/analytics/bi` returns the BI catalog filtered to the current session and scope.
- **Query validation:** `POST /api/analytics/bi` validates metric, dimension, filter, tenant, limit, and date-range requests without accepting caller SQL.
- **Sensitive export guard:** export policies require permissions, audit reasons, max-row limits, and approval metadata for PII/financial exports.
- **Durable BI schema:** `bi_datasets`, `bi_dashboards`, `bi_report_definitions`, `bi_report_runs`, and `bi_metric_snapshots` support saved reports, scheduled runs, and future snapshots.
- **Forced RLS:** BI tables use tenant isolation; shared catalog rows are readable, tenant report definitions and runs remain tenant-scoped, and platform aggregate rows require bypass.
- **Route policy:** `/analytics` and `/api/analytics` are registered in the authorization route policy catalog.

## BI Domains

| Domain | Dataset | Primary Sources |
| --- | --- | --- |
| Enrollment | `enrollment.students` | `students`, `guardians`, `sections`, `grades` |
| Attendance | `attendance.daily` | `attendance_records`, `students`, `sections`, `grades` |
| Academics | `academics.results` | `student_results`, `exam_schedules`, `subjects`, `exams` |
| Fees | `fees.ledger` | `invoices`, `payments`, `payment_orders`, `payment_provider_events` |
| Admissions | `admissions.pipeline` | `admission_leads`, `admission_applications`, `students` |
| Communications | `communications.delivery` | `notification_outbox`, `notification_delivery_events` |
| Operations | `operations.jobs` | `background_jobs`, `background_job_attempts` |
| Platform | `platform.tenant_fleet` | `tenants`, `companies`, `payments` |
| AI Economics | `platform.ai_economics` | `ai_token_logs`, `tenants`, `companies` |

## Dashboard Contract

Dashboards are declared as tiles over datasets and metrics:

- `school.executive_overview`
- `finance.collections`
- `academics.outcomes`
- `platform.portfolio`

Existing analytics pages can move onto this catalog one by one without changing their visual design.

## Export Contract

Exports are policy-backed, not free-form:

- CBSE results export
- UDISE+ annual export
- Fee outstanding export
- Platform portfolio export

Sensitive tenant exports are linked to `data.export_pii` approval metadata and require an audit reason.

## Remaining Product Work

- Migrate existing analytics pages from ad hoc SQL actions onto the BI query executor.
- Add a real BI query executor that maps approved metric/dimension IDs to parameterized SQL templates.
- Add scheduled report jobs that write `bi_report_runs` and `bi_metric_snapshots`.
- Add report builder persistence over `bi_report_definitions`.
- Add CSV/XLSX generation through the export policy layer.
- Add dashboard-level caching and snapshot comparison for month-over-month trends.
