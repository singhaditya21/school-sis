# Scope: E2E Testing Track for Remaining 5 Buckets

## Architecture
This scope covers E2E tests for the final 5 remaining scaffolding buckets of the School SIS platform:
1. Financial & Treasury: ledgers (`/treasury`) and tally export (`/integrations/tally`) -> `treasury-core.spec.ts`
2. HQ & Multi-Tenant Management: command center (`/hq`) and platform configurations (`/platform`) -> `hq-core.spec.ts`
3. Advanced Analytics: analytics (`/analytics`) and academic calendar (`/calendar`) -> `analytics-core.spec.ts`
4. Student Success: placements (`/university`), alumni tracking (`/alumni`), and international (`/international`) -> `student-success-core.spec.ts`
5. Daily Utilities: storage (`/documents`) and daily logs (`/diary`) -> `utilities-core.spec.ts`

Testing is conducted using Playwright E2E test runner against local Next.js dev server. We verify authentication, layout structure, features coverage, boundary cases, cross-feature flows, and real-world workloads.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Plan & Scope Definition | Create SCOPE.md and define 60 test cases | none | IN_PROGRESS |
| 2 | TEST_INFRA.md Update | Record features, scenarios, and configurations in test infra registry | M1 | PLANNED |
| 3 | E2E Tests Implementation | Create the 5 core spec files in `apps/web/e2e/` | M2 | PLANNED |
| 4 | Playwright Test Verification | Run the test suite and verify test recognition by Playwright | M3 | PLANNED |
| 5 | TEST_READY.md Publishing | Output the final test suite checklists and results | M4 | PLANNED |

## Interface Contracts
- **Admin Authentication**: Tests authenticate via `loginAsAdmin` helper, posting to `/login` with `admin@schoolsis.com` / `admin123` and waiting for redirect to `/dashboard`.
- **Database Isolation**: Tests execute database cleanups and state resets before each run using the pool-based `runQuery` utility or relative seeds.
- **Scaffold Fallbacks**: Tests verify that routes are registered and page elements load, expecting typical failures if the back-end actions/endpoints are mock-only or not fully populated.

## Test Case Registry

### 1. Financial & Treasury (`e2e/treasury-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-TR-101: Treasury Dashboard loads with summary metrics (ARR, collection, outstanding)
  - E2E-TR-102: View Reconciliation Exceptions table with transactions
  - E2E-TR-103: Sync Vouchers form default dates populated
  - E2E-TR-104: Ledger mapping config mappings list
  - E2E-TR-105: Trigger Challenge action button in exception table
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-TR-201: Access restricted for unauthorized parent role (redirection check)
  - E2E-TR-202: Tally export date validator blocks empty submission
  - E2E-TR-203: Handle negative/zero or empty receivables/overdue database state
  - E2E-TR-204: Tally export with invalid date range (fromDate > toDate) validation handling
  - E2E-TR-205: View mappings configuration empty state or backup mappings
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-310: Treasury ledger export integrates with Tally sync history records
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-406: Mid-term financial sync: Admin reviews payment ledger exceptions, resolves dispute, and exports updated vouchers to Tally ERP

### 2. HQ & Multi-Tenant Management (`e2e/hq-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-HQ-101: Global Command Center loads with platform stats
  - E2E-HQ-102: View Campus Fleet Matrix table listing active tenants
  - E2E-HQ-103: Access Tenant Onboarding form
  - E2E-HQ-104: View Tenant Configuration/Settings page
  - E2E-HQ-105: Verify Platform Billing metrics and stripe invoices list
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-HQ-201: Tenant onboarding form validation for empty values
  - E2E-HQ-202: Non-admin access to HQ redirects to unauthorized page
  - E2E-HQ-203: Onboard tenant with already existing name or email error handling
  - E2E-HQ-204: Suspend/reactivate tenant button changes state in database or toggle view
  - E2E-HQ-205: Active modules array configuration handles empty values in update company settings
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-306: Creating a new school tenant in HQ provisions database tables, and allows admin login to new dashboard
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-407: Platform administrator onboarding loop: Onboarding a new school, updating settings, setting custom domain mask, and impersonating the school administrator to verify initialization

### 3. Advanced Analytics (`e2e/analytics-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-AN-101: Analytics Dashboard metrics cards load
  - E2E-AN-102: View Fee Collection Trend bar chart
  - E2E-AN-103: View Attendance heatmap/grid
  - E2E-AN-104: View Class-wise Exam performance chart
  - E2E-AN-105: View Top Performers table
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-AN-201: Redirection for parent/teacher roles on core analytics page
  - E2E-AN-202: Top performers empty state (no student scores)
  - E2E-AN-203: Attendance heatmap handles missing date values gracefully
  - E2E-AN-204: Zero fee collected state shows 0% collection or handles empty array
  - E2E-AN-205: Exam score graph handles missing sections or empty classes
- **Tier 3 (Cross-Feature Combinations)**:
  - [Covered in Student Success and Utilities]
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-409: Term-end academic audit: Pulling advanced exam analytics, verifying with the academic calendar schedules, and compiling reports

### 4. Student Success (`e2e/student-success-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-SS-101: Placements/University dashboard lists degree programs
  - E2E-SS-102: Alumni tracking dashboard lists alumni directory
  - E2E-SS-103: International dashboard displays Visa Compliance card
  - E2E-SS-104: Placements courses page loads mapping list
  - E2E-SS-105: Alumni events list loads upcoming schedules
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-SS-201: Alumni directory verification toggle button action
  - E2E-SS-202: Placement list displays "No degree programs" placeholder on empty state
  - E2E-SS-203: International visa tracker handles expired passports or empty database alerts
  - E2E-SS-204: Student success pages block unauthenticated users
  - E2E-SS-205: Alumni location/company filter with zero matching outputs
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-307: Student placement / degree program enrollment integration with student records
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-408: Student success evaluation: Evaluating placement metrics, tracing corresponding alumni paths, and cross-referencing visa compliance for international students

### 5. Daily Utilities (`e2e/utilities-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-UT-101: Student Documents page displays document stats
  - E2E-UT-102: View Documents registry table
  - E2E-UT-103: School Diary page lists homework/announcements entries
  - E2E-UT-104: Open diary New Entry button
  - E2E-UT-105: Verify document verified badge/tag indicator
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-UT-201: Empty documents table state matches placeholder
  - E2E-UT-202: Document verify status checkbox/toggle changes status in DB/UI
  - E2E-UT-203: School diary displays empty message if no entries exist
  - E2E-UT-204: Access restrictions for Parent role on doc verification
  - E2E-UT-205: Diary entry title character count limits validation
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-308: Uploading student document in Storage updates student profile verification checklist
  - E2E-COM-309: New diary entry creation triggers a broadcast notification event in HQ dashboard
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-410: Daily class admin loop: Teacher posts daily homework to diary, uploads supporting documents, and checks student read-status
