# Database RLS Policy Matrix

Last reviewed: 2026-08-07
Schema source: the latest numbered snapshot in `apps/web/drizzle/meta/`
Enforcement source: `packages/api/src/db/migrations/tenant-rls.sql`

This document classifies every schema-managed public table. CI runs
`pnpm audit:rls-matrix` so a new table cannot land without either a direct
`tenant_id` policy or an explicit special classification below.

At runtime, tenant and reviewed bypass settings are transaction-local. The DB
wrapper applies them after `BEGIN` and before the protected query, including for
standalone `pool.query` calls, so transaction poolers cannot separate the
context-setting statement from the data statement.

## Classification rules

| Classification | Read/write rule |
|---|---|
| `tenant-direct` | Row has `tenant_id`; all operations require the active tenant to match, except explicit platform bypass. |
| `tenant-root` | Tenant row is visible only when its `id` is the active tenant. Inserts/updates must preserve that identity; deletes require platform bypass. |
| `tenant-parent` | Parent row is visible through an active tenant relationship; creation/deletion requires platform bypass. |
| `tenant-join` | Row inherits tenant ownership through referenced parent rows; every referenced parent must resolve inside the active tenant. |
| `global-tenant-readable` | Authenticated tenant contexts may read; only platform bypass may mutate. |
| `tenant-with-global-read` | Tenant-owned rows use normal tenant isolation; reviewed global rows are tenant-readable but platform-managed. |
| `tenant-read-platform-write` | A tenant may read its associated row; only platform bypass may create, update, or delete it. |
| `platform-only` | Only an explicit platform/RLS-bypass context may read or mutate. |

## Explicit special-policy tables

| Table | Classification | Ownership path / justification |
|---|---|---|
| `companies` | `tenant-parent` | Visible through `tenants.company_id`; platform-only create/delete. |
| `tenants` | `tenant-root` | `tenants.id = app.current_tenant`. |
| `grade_subjects` | `tenant-join` | Both `grades` and `subjects` must belong to the active tenant. |
| `fee_components` | `tenant-join` | Inherits through `fee_plans.tenant_id`. |
| `stops` | `tenant-join` | Inherits through `routes.tenant_id`. |
| `exam_schedules` | `tenant-join` | Inherits through `exams.tenant_id`. |
| `field_permissions` | `tenant-join` | Inherits through the metadata field/object relationship. |
| `metadata_fields` | `tenant-join` | Inherits through `metadata_objects`, including built-in object visibility rules. |
| `metadata_layouts` | `tenant-join` | Inherits through `metadata_objects`. |
| `metadata_records` | `tenant-join` | Row tenant must match, and its object must be tenant-owned or a reviewed global built-in. |
| `metadata_values` | `tenant-join` | Record and field must resolve within the active tenant metadata object. |
| `metadata_objects` | `tenant-with-global-read` | Tenant-owned objects are isolated normally; non-custom global definitions are readable but not tenant-writable. |
| `metadata_schema_versions` | `tenant-with-global-read` | Tenant-owned versions are isolated normally; published global versions are readable but not tenant-writable. |
| `grading_rubrics` | `tenant-join` | Inherits through the tenant-scoped grading scale/academic relationship. |
| `multi_campus_hierarchy` | `tenant-read-platform-write` | A tenant reads its own hierarchy link; the platform owns hierarchy mutation. |
| `hq_groups` | `tenant-join` | Read visibility inherits through a tenant's `multi_campus_hierarchy` link; the platform owns mutation. |
| `group_policies` | `tenant-join` | Read visibility inherits through a tenant's group link; the platform owns mutation. |
| `platform_broadcasts` | `global-tenant-readable` | Tenant-visible announcements; platform context is the sole writer. |
| `marketing_leads` | `platform-only` | Public intake is persisted only through a reviewed platform bypass. |
| `platform_audit_logs` | `platform-only` | Cross-tenant operational evidence. |
| `rate_limit_buckets` | `platform-only` | Cross-tenant operational counters containing hashed endpoint/identity keys. |

`password_reset_tokens` is a conditional runtime table not present in the
Drizzle snapshot. When present, its policy inherits tenant ownership through
`users.tenant_id`.

## Direct tenant tables

Every table below contains a non-null or domain-defined `tenant_id` column and
is covered by the migration's dynamic `tenant_isolation_policy` loop.

```text
users
academic_years
grades
sections
subjects
terms
guardians
students
concessions
fee_plans
fine_rules
invoices
payment_audit_logs
payment_orders
payment_provider_events
payments
receipts
admission_applications
admission_documents
admission_leads
attendance_records
periods
substitution_requests
substitutions
timetable_entries
driver_background_checks
live_gps_pings
routes
student_transport
vehicle_maintenance_logs
vehicles
consents
messages
exam_proctoring_logs
exam_result_hashes
exams
student_results
audit_logs
designations
leave_policies
leave_requests
staff_departments
staff_profiles
book_issues
book_reservations
books
webhook_deliveries
webhook_subscriptions
integration_api_keys
integration_audit_logs
integration_connections
hostel_allocations
hostel_fees
hostel_rooms
hostels
mess_menus
assets
consumables
stock_alerts
visitors
health_incidents
health_records
immunizations
medication_schedules
nurse_visit_logs
academic_events
quiz_attempts
quiz_questions
quizzes
homework_assignments
homework_submissions
lesson_plans
certificate_templates
digilocker_sync_logs
id_cards
issued_certificates
alumni_events
alumni_profiles
alumni_registrations
message_logs
message_templates
consent_forms
consent_responses
metadata_workflows
workflows
student_documents
metadata_migration_jobs
agent_approvals
agent_audit_logs
embeddings
background_job_attempts
background_jobs
notification_delivery_events
notification_outbox
observability_events
slo_definitions
slo_measurements
sre_incidents
workflow_approval_delegations
workflow_approval_events
workflow_approval_requests
workflow_approval_reviews
operator_console_action_logs
operator_console_runbooks
operator_console_snapshots
bi_dashboards
bi_datasets
bi_metric_snapshots
bi_report_definitions
bi_report_runs
faculty_workload
university_courses
university_programs
coaching_batches
test_series
test_series_results
host_families
international_placements
student_visas
ai_token_logs
ai_budget_usage
grading_scales
appointments
diary_entries
```

## Verification gates

- `pnpm audit:rls-matrix` fails if a schema table is unclassified or an
  explicitly classified table lacks an RLS policy block.
- `pnpm audit:migrations` rejects destructive SQL unless the statement has an
  adjacent owner-and-rollback approval marker.
- The migration-chain CI job applies all Drizzle migrations, applies
  `tenant-rls.sql`, and runs live cross-tenant read/write isolation assertions.
- Remote database connections default to certificate-verifying TLS. The
  `DATABASE_SSL_MODE=require` compatibility waiver must be explicitly set when
  a provider cannot support verification; `disable` is restricted to localhost.
