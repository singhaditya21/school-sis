# Project: School SIS Phase 4 Remaining Scaffolding Implementation

## Architecture
- **Backend Services & Actions**: Located in `apps/web/src/lib/actions/` and `apps/web/src/lib/services/`. Server actions interact with the database using Drizzle ORM, replacing direct pg `pool` queries where appropriate, and verifying tenant isolation by checking `session.tenantId`.
- **Frontend Pages**: Next.js App Router components under `apps/web/src/app/`. They consume server actions or services directly, replacing hardcoded mock states and useState client data with dynamic data.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E Test Suite Expansion | Expand Playwright E2E tests for the final 5 remaining scaffolding buckets under `apps/web/e2e/`. | None | DONE (Conv ID: f139dbd6-91fb-4454-a8fa-7ef58b17466e) |
| M2 | Financial & Treasury | Wire `/treasury` ledgers and `/integrations/tally` export logic, enforce tenant isolation, fix tally vouchers API column bugs. | M1 | IN_PROGRESS (Conv ID: b6a7a708-ec44-45dd-b914-af456a367a95) |
| M3 | HQ & Multi-Tenant Management | Wire `/hq` and `/platform` routes, fix updated_at / casing bugs, wire leads and settings config table. | M1 | IN_PROGRESS (Conv ID: b6a7a708-ec44-45dd-b914-af456a367a95) |
| M4 | Advanced Analytics | Wire `/analytics` and `/calendar` events, pre-render data on server components. | M1 | IN_PROGRESS (Conv ID: b6a7a708-ec44-45dd-b914-af456a367a95) |
| M5 | Student Success | Wire `/university` (placements), `/alumni` tracking, and `/international` host family/visa compliance. | M1 | IN_PROGRESS (Conv ID: b6a7a708-ec44-45dd-b914-af456a367a95) |
| M6 | Daily Utilities | Implement Drizzle schemas for `diary_entries` and `appointments`, wire `/documents` and `/diary` logs. | M1 | IN_PROGRESS (Conv ID: b6a7a708-ec44-45dd-b914-af456a367a95) |
| M7 | Integration & Verification | Run TypeScript builds, sync Drizzle schemas, pass full E2E test suite, and run Forensic Auditor. | M2, M3, M4, M5, M6 | PLANNED |

## Interface Contracts
### Financial & Treasury
- `getTreasurySummaryAction()`: Returns dynamic collected, outstanding, and overdue metrics.
- `getPaymentsLedgerAction(limit)`: Returns payment ledger entries.
- `/api/integrations/tally/vouchers`: POST API returning tally-compatible XML vouchers.

### HQ & Multi-Tenant
- `getGlobalMetricsAction()`: Aggregates global ARR, active tenants, enrollment, and churn.
- `impersonateTenantAction(tenantId)`: SaaS tech-support impersonation loops.
- `updateCompanySettingsAction(companyId, settings)`: Saves tenant tier and active modules configuration.
- `createBroadcastAction(data)`: Publishes system-wide alerts.

### Advanced Analytics
- `getAnalyticsSummary()`: Computes attendance, exam grades, and fee collection rates.
- `getAcademicEvents()`: Fetches central calendar logs.

### Student Success
- `getUniversityDashboardSummaryAction()`: Higher ed degree programs and faculty workload statistics.
- `getAlumniProfiles()` & `getAlumniEvents()`: Alumni logs and event registrations.
- `getStudentVisasAction()` & `getHostFamiliesAction()`: International student operations.

### Daily Utilities
- `getDiaryEntries()`: Returns class homework and announcements.
- `getAppointments()`: Returns student/teacher appointments.
- `studentDocuments`: Verification status updates.

## Code Layout
- Backend Services & Actions:
  - Treasury & Tally: `apps/web/src/lib/actions/treasury.ts`
  - HQ & Platform: `apps/web/src/lib/actions/hq.ts`, `platform.ts`, `platform-broadcasts.ts`
  - Analytics: `apps/web/src/lib/actions/analytics.ts`, `apps/web/src/lib/services/analytics/`
  - Student Success: `apps/web/src/lib/actions/higher_ed.ts`, `alumni.ts`, `international.ts`
  - Daily Utilities: `apps/web/src/lib/actions/document.ts`, `apps/web/src/lib/services/diary/`, `apps/web/src/lib/services/appointments/`
- DB Schemas: `apps/web/src/lib/db/schema/`
  - HQ: `hq.ts`
  - Platform: `platform.ts`
  - Alumni: `alumni.ts`
  - International: `international.ts`
  - Higher Ed: `higher_ed.ts`
  - Documents: `documents.ts`
  - Calendar: `calendar.ts`
  - Diary & Appointments: `diary.ts` (newly created)
- Frontend Pages:
  - Treasury: `apps/web/src/app/(admin)/treasury/`
  - Tally: `apps/web/src/app/(admin)/integrations/tally/`
  - HQ & Platform: `apps/web/src/app/hq/`, `apps/web/src/app/platform/`, `apps/web/src/app/(admin)/hq-overview/`, `apps/web/src/app/(admin)/hq-policies/`
  - Analytics: `apps/web/src/app/(admin)/analytics/`
  - Calendar: `apps/web/src/app/(admin)/calendar/`
  - University Placements: `apps/web/src/app/(admin)/university/`
  - Alumni: `apps/web/src/app/(admin)/alumni/`
  - International: `apps/web/src/app/(admin)/international/`
  - Documents: `apps/web/src/app/(admin)/documents/`
  - Diary: `apps/web/src/app/(admin)/diary/`
