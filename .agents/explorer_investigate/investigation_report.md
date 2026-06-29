# Codebase Scaffolding Investigation Report

This report presents a detailed read-only investigation of the final 5 remaining scaffolding buckets in the ScholarMind codebase:
1. **Financial & Treasury**
2. **HQ & Multi-Tenant Management**
3. **Advanced Analytics**
4. **Student Success**
5. **Daily Utilities**

---

## 1. Financial & Treasury Domain

### A. Component Mapping
* **Page / Layout Components**:
  * `apps/web/src/app/(admin)/treasury/page.tsx` — Server Component displaying the Payment Orchestration dashboard (revenue collected, outstanding receivables, overdue metrics, and manual reconciliation alerts).
  * `apps/web/src/app/(admin)/integrations/tally/page.tsx` — Server Component for Tally ERP 9 / Prime Integration (Ledger Mapping configurations and Sync history).
  * `apps/web/src/app/(admin)/integrations/tally/TallyExportForm.tsx` — Client Component handling the date range inputs and triggering the Tally XML export download.
* **API Endpoints**:
  * `apps/web/src/app/api/integrations/tally/vouchers/route.ts` — Dynamic POST endpoint returning Tally ERP-compatible XML vouchers for the specified date range.

### B. Mock Data and Hardcoded UI Arrays
* **Reconciliation Exceptions Grid**: `apps/web/src/app/(admin)/treasury/page.tsx` has two hardcoded transactions (`txn_74h284jf` and `txn_p398d2jk`) displaying chargeback and network failure status alerts.
* **Tally Sync History**: `apps/web/src/app/(admin)/integrations/tally/page.tsx` hardcodes historical batch downloads:
  * "Yesterday's Collections" (24 Vouchers, 1.2MB XML)
  * "Last Week Batch" (156 Vouchers, 4.8MB XML)
* These must be wired to a dynamic audit log or sync tracker table.

### C. Drizzle Schema Analysis
* **Schema File**: `apps/web/src/lib/db/schema/fees.ts`
* **Table Mappings**:
  * `payments` table maps to database table `payments`.
  * `invoices` table maps to database table `invoices`.
  * `receipts` table maps to database table `receipts`.
* No specific `treasury.ts` schema file exists; all financial models are consolidated under `fees.ts`.

### D. Existing Actions & Services
* **Action File**: `apps/web/src/lib/actions/treasury.ts`
* **Provided Actions**:
  * `getTreasurySummaryAction()` — Aggregates total collected payments, pending invoices, and overdue invoices using raw SQL client queries.
  * `getPaymentsLedgerAction(limit)` — Retrieves the payment history joined with invoices.
* **New Actions Needed**:
  * Actions for retrieving ledger mapping rules (e.g. mapping payment methods to specific Tally Ledger names).
  * Actions for fetching and logging Tally sync batch history.

### E. Code Mismatches & Potential Bugs
1. **Critical Query Bug (Lack of Tenant Isolation)**: In `apps/web/src/lib/actions/treasury.ts` inside `getTreasurySummaryAction`, the overdue and outstanding invoices aggregations do NOT filter by `tenant_id`:
   ```typescript
   // Aggregate total overdue (missing tenant_id filter)
   const { rows: overdueQuery } = await pool.query(`
       SELECT sum(total_amount) AS "totalOverdue"
       FROM invoices
       WHERE status = $1
   `, ['OVERDUE']);
   ```
   This will leak financial metrics across tenants in a multi-tenant environment.
2. **Missing Column / Query Crash**: In `apps/web/src/app/api/integrations/tally/vouchers/route.ts` (lines 31-46), the SQL query selects `p.provider_reference`:
   ```sql
   SELECT p.id, p.amount, p.method, p.paid_at, p.provider_reference, ...
   ```
   However, the `payments` table schema in `fees.ts` does not contain a `provider_reference` column. It has `transaction_id` or `razorpay_payment_id` instead. This route will throw a database error and crash at runtime when hit.
3. **Raw SQL Execution**: Both the action file and the API route use direct pg `pool.query` instead of type-safe Drizzle query builders.

---

## 2. HQ & Multi-Tenant Management Domain

### A. Component Mapping
* **Page / Layout Components**:
  * `apps/web/src/app/hq/layout.tsx` — Global layout for the command center dashboard.
  * `apps/web/src/app/hq/page.tsx` — Server Component displaying macroscopic KPIs (ARR, Active Tenants, Enrollment, and Churn Risk) and the Campus Fleet Matrix.
  * `apps/web/src/app/hq/ai-governance/page.tsx` — Server Component aggregating AI telemetry metrics.
  * `apps/web/src/app/hq/ai-governance/client-page.tsx` — Client Component displaying Recharts charts for AI compute spend distribution and token burn.
  * `apps/web/src/app/hq/audit/page.tsx` — Server Component displaying SIEM logs from `platform_audit_logs`.
  * `apps/web/src/app/hq/broadcasts/page.tsx` & `client-page.tsx` — Page components for publishing and viewing platform broadcasts.
  * `apps/web/src/app/hq/compliance/page.tsx` — Server Component showing DPDP and FERPA compliance checklists.
  * `apps/web/src/app/hq/leads/page.tsx` & `client-page.tsx` — Page components for tracking inbound B2B marketing leads.
  * `apps/web/src/app/hq/policies/page.tsx` & `PolicyClient.tsx` — Components for HQ-connected tenant policies.
  * `apps/web/src/app/hq/settings/page.tsx` & `client-page.tsx` — Components for central SaaS deployments, AI compute limits, and cryptographics.
  * `apps/web/src/app/hq/tenants/page.tsx` & `client-page.tsx` — Directory listing of all active enclaves.
  * `apps/web/src/app/hq/treasury/page.tsx` & `client-page.tsx` — Macroscopic financial routing dashboard.
  * `apps/web/src/app/platform/page.tsx` — Top-level platform redirect (redirects to `/hq`).
  * `apps/web/src/app/platform/layout.tsx` — Layout containing sidebar mapping.
  * `apps/web/src/app/platform/tenants/page.tsx`, `tenants/[id]/page.tsx` & `tenants/new/page.tsx` — Master provider-level administration views.
  * `apps/web/src/app/(admin)/hq-overview/page.tsx` & `DeployPolicyForm.tsx` — Super Admin portal views at the tenant level.
  * `apps/web/src/app/(admin)/hq-policies/page.tsx` — Displays enforced central mandates on client campuses.

### B. Mock Data and Hardcoded UI Arrays
* **Global Configurations useState Mock**: `apps/web/src/app/hq/settings/client-page.tsx` (lines 7-17) mocks settings in local React state:
  * `allowNewTenants: true`
  * `enforceHardwareKeys: false`
  * `aiTokenMultiplier: 1.5`
  * `defaultStorageGB: 50`
  * Clicking "Commit Parameters" simply fires a browser `alert()`. These settings need to be backed by a platform configuration database table.
* **Static Impersonation / Suspension Actions**: In `hq/tenants/client-page.tsx` (lines 179-184), the "Impersonate Node" and "Suspend Node" action buttons are non-functional markup with no event handlers bound.

### C. Drizzle Schema Analysis
* **Schema Files**:
  * `apps/web/src/lib/db/schema/platform.ts` — defines `platform_audit_logs`, `ai_token_logs`, `platform_broadcasts`, and `marketing_leads`.
  * `apps/web/src/lib/db/schema/hq.ts` — defines `hq_groups`, `multi_campus_hierarchy`, and `group_policies`.
* All schemas map perfectly to existing database tables.

### D. Existing Actions & Services
* **Action Files**:
  * `apps/web/src/lib/actions/platform.ts` — Contains global ARR aggregation, tenant provisioning, tech-support impersonation loops (`impersonateTenantAction` and `returnToHQAction`), company billing updates, and AI metering logs.
  * `apps/web/src/lib/actions/platform-broadcasts.ts` — Contains `createBroadcastAction`.
  * `apps/web/src/lib/actions/hq.ts` — Handles headquarters policy deployment.
  * `apps/web/src/lib/actions/tenant-policies.ts` — Fetches enforced policies applied to the current tenant.

### E. Code Mismatches & Potential Bugs
1. **HQ Overview Column Mismatch**: In `apps/web/src/lib/actions/hq.ts` (lines 15-18), the query fetches `updated_at AS "updatedAt" FROM hq_groups`. However, the Drizzle schema in `hq.ts` for `hqGroups` does NOT define an `updated_at` column. This query will crash at runtime.
2. **Platform Broadcasts Field Casing Mismatch**: In `hq/broadcasts/page.tsx`, the raw query fetches `SELECT * FROM platform_broadcasts`. However, the client component `client-page.tsx` (lines 27, 88, 91) accesses fields using camelCase: `b.isActive` and `b.targetTiers`. Because the query does not alias these columns, they return as `is_active` and `target_tiers` from the database. Consequently, `isActive` and `targetTiers` will evaluate to `undefined` in the browser, breaking active status filters and target tier badges.
3. **Platform Broadcasts Column Mismatch**: In `hq/broadcasts/page.tsx` (line 17), the query fetches `updated_at AS "updatedAt" FROM platform_broadcasts`. However, `platformBroadcasts` does not have an `updated_at` column in `platform.ts` schema. This will fail with a database error.
4. **Marketing Leads Field Casing Mismatch**: In `hq/leads/page.tsx`, the query selects columns using camelCase aliases (`contact_name AS "contactName"`, etc.). However, in the client component `hq/leads/client-page.tsx` (lines 113, 117, 122, 124, 127), the code reads snake_case fields: `lead.created_at`, `lead.school_name`, `lead.contact_email`, `lead.contact_name`, and `lead.student_capacity`. Because the aliases mapped them to camelCase, all these properties evaluate to `undefined`, resulting in empty table columns and an invalid date error at runtime.
5. **Treasury Column Mismatch**: In `hq/treasury/page.tsx` (line 17), the SQL query selects `payment_method` from `payments`. However, in the `payments` table schema (defined in `fees.ts`), the column is named `method` (it maps to SQL column `method`). This will throw a `column "payment_method" does not exist` database error.
6. **Active Modules Type Mismatch**: In `updateCompanySettingsAction` in `lib/actions/platform.ts` (line 321), `activeModules` is written as a JSON string: `payload.activeModules ? JSON.stringify(payload.activeModules) : '[]'`. However, `activeModules` in the `companies` table schema is a native Postgres text array (`text[ ]`). Binding a stringified JSON array to a text array will throw a type error at the database driver level. It should instead be passed as a native JS array (`payload.activeModules || []`).

---

## 3. Advanced Analytics Domain

### A. Component Mapping
* **Page / Layout Components**:
  * `apps/web/src/app/(admin)/analytics/page.tsx` — Client Component displaying aggregated school performance summaries, fee collection bars, and attendance calendar cells.
  * `apps/web/src/app/(admin)/analytics/attendance/page.tsx` — Client Component for deep attendance tracking trends.
  * `apps/web/src/app/(admin)/analytics/exams/page.tsx` — Client Component for subject-wise and class-wise grade comparisons.
  * `apps/web/src/app/(admin)/analytics/fees/page.tsx` — Client Component showing monthly fee collection targets vs collected volumes.
  * `apps/web/src/app/(admin)/calendar/page.tsx` — Server Component displaying upcoming events, exam timetables, and parent-teacher meetings.

### B. Mock Data and Hardcoded UI Arrays
* **Hardcoded monthly growth**: In `getAnalyticsSummary` in `lib/actions/analytics.ts` (line 33), the `monthlyGrowth` is returned as a hardcoded `0` value.
* **Component Loaders**: The analytics pages are `'use client'` files that display blank/skeleton layouts while state variables fetch data on mount. Converting these to server components would allow pre-rendering trends with better load times.

### C. Drizzle Schema Analysis
* **Schema File**: `apps/web/src/lib/db/schema/calendar.ts` maps to the `academic_events` table.
* There is no standalone Drizzle schema for `analytics` because the analytics module runs computations on top of other schemas (`students`, `payments`, `invoices`, `attendance_records`, `exam_results`, etc.).

### D. Existing Actions & Services
* **Action File**: `apps/web/src/lib/actions/analytics.ts` (contains aggregations for class-wise grades, fee trends, student KPIs, and weekly/daily attendance).
* **Service File**: `apps/web/src/lib/services/analytics/analytics.service.ts` (exposes `AnalyticsService` executing SQL queries on attendance trends, gradebook distributions, and monthly collection ratios).
* **Calendar Actions**: `apps/web/src/lib/actions/calendar.ts` (handles CRUD operations on the `academic_events` table).

### E. Code Mismatches & Potential Bugs
1. **Raw SQL Execution**: All queries are implemented either via direct pg client pool (`pool.query`) or raw SQL strings wrapped in drizzle-orm `sql` template tags (`db.execute(sql`...`)`). Converting these to Drizzle select/joins will improve type safety.

---

## 4. Student Success Domain

### A. Component Mapping
* **Page / Layout Components**:
  * `apps/web/src/app/(admin)/university/page.tsx` — Server Component acting as the Higher Education suite dashboard.
  * `apps/web/src/app/(admin)/university/courses/page.tsx` — Server Component displaying the institutional Course Catalog.
  * `apps/web/src/app/(admin)/alumni/page.tsx` — Server Component showing registered alumni, verification states, and graduation batches.
  * `apps/web/src/app/(admin)/international/page.tsx` — Client Component rendering static UI sections for international visa compliance, host families, and placements.

### B. Mock Data and Hardcoded UI Arrays
* **Static International Dashboard**: `apps/web/src/app/(admin)/international/page.tsx` is completely static and hardcoded. It needs to be refactored to fetch dynamic rows from `student_visas`, `host_families`, and `international_placements` tables.
* **Faculty Workload Mock**: `getUniversityDashboardSummaryAction` in `lib/actions/higher_ed.ts` (line 65) returns a hardcoded `facultyAllocations: 0`.

### C. Drizzle Schema Analysis
* **Schema Files**:
  * `apps/web/src/lib/db/schema/higher_ed.ts` — defines `university_programs`, `university_courses`, and `faculty_workload`.
  * `apps/web/src/lib/db/schema/alumni.ts` — defines `alumni_profiles`, `alumni_events`, and `alumni_registrations`.
  * `apps/web/src/lib/db/schema/international.ts` — defines `student_visas`, `host_families`, and `international_placements`.
* All schemas map perfectly to existing database tables.

### D. Existing Actions & Services
* **Action Files**:
  * `apps/web/src/lib/actions/higher_ed.ts` — Contains queries to fetch degree programs, course credit maps, and simple Higher Ed metrics.
  * `apps/web/src/lib/actions/alumni.ts` — Handles alumni profile registrations, verification hooks, and stats mapping.
* **Service File**:
  * `apps/web/src/lib/services/alumni/alumni.service.ts` — Exposes static database helpers.
* **Missing Actions**:
  * **No actions or services exist** for the international student operations domain. Visas and host family logs cannot currently be fetched or written to.

### E. Code Mismatches & Potential Bugs
1. **University Programs Column Mismatch**: In `apps/web/src/lib/actions/higher_ed.ts` (line 14), `getUniversityProgramsAction` selects `updated_at AS "updatedAt" FROM university_programs`. However, the `university_programs` table defined in `higher_ed.ts` schema does NOT have an `updated_at` column. This query will crash.
2. **Alumni Profiles Column Mismatch**: In `apps/web/src/lib/actions/alumni.ts` (line 8 & line 30), `getAlumni` selects `updated_at AS "updatedAt" FROM alumni_profiles`. However, the Drizzle schema in `alumni.ts` for `alumni_profiles` does NOT define an `updated_at` column. This will crash when querying.
3. **Alumni Events Column Mismatch**: In `apps/web/src/lib/actions/alumni.ts` (line 47 & line 65), the code selects `updated_at AS "updatedAt" FROM alumni_events`. However, the `alumni_events` table in `alumni.ts` schema does NOT have an `updated_at` column either.
4. **Alumni Service Dead Code / Table Mismatch**: The file `apps/web/src/lib/services/alumni/alumni.service.ts` queries a table named `alumni` (line 10) with columns like `first_name`, `last_name`, `current_org`, `city`, `is_active`, and `donation_amount`. However, the Drizzle schema `alumni.ts` defines the table as `alumni_profiles` with a single `name` column, `current_company`, `location`, and `is_verified` columns. This service file is completely outdated, non-functional, and represents dead code (it is not imported anywhere in the project).

---

## 5. Daily Utilities Domain

### A. Component Mapping
* **Page / Layout Components**:
  * `apps/web/src/app/(admin)/documents/page.tsx` — Server Component displaying uploaded student credentials and verification pipelines.
  * `apps/web/src/app/(admin)/diary/page.tsx` — Client Component displaying homework and class announcement history.

### B. Mock Data and Hardcoded UI Arrays
* No direct mock arrays are present in the components themselves, as they are wired to call backend endpoints.

### C. Drizzle Schema Analysis
* **Schema File**:
  * `apps/web/src/lib/db/schema/documents.ts` — defines the `student_documents` table.
* **Missing Schemas**:
  * **No schema file exists** for the `diary` or `appointments` tables! The database tables `diary_entries` and `appointments` are queried by services but are completely missing from the Drizzle ORM schemas and index exports.

### D. Existing Actions & Services
* **Action Files**:
  * `apps/web/src/lib/actions/document.ts` — Handles student document queries and verification updates.
  * `apps/web/src/lib/actions/documents.ts` — Handles B2B admissions lead documents, piping files to the external core Go API endpoint (`http://localhost:8080`).
* **Service Files**:
  * `apps/web/src/lib/services/diary/diary.service.ts` — Contains the `getDiaryEntries()` query.
  * `apps/web/src/lib/services/appointments/appointments.service.ts` — Contains the `getAppointments()` query.

### E. Code Mismatches & Potential Bugs
1. **Missing Drizzle Table Entities**: The services query `diary_entries` and `appointments` tables directly using raw queries. Because these tables are missing from the Drizzle ORM schema:
   * Automatic database migrations will not create them.
   * Drizzle ORM cannot be used to query them safely.
   * A new `diary.ts` schema file defining `diary_entries` and `appointments` tables needs to be implemented.
