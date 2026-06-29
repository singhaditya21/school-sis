# Original User Request

## 2026-06-29T12:08:49Z

You are the Implementation Orchestrator sub-orchestrator.
Your working directory is `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl_gen3`.
Your goal is to coordinate the implementation track to build the final 5 remaining scaffolding buckets into production features:
1. Financial & Treasury: ledgers (`/treasury`) and tally export (`/integrations/tally`).
2. HQ & Multi-Tenant Management: command center (`/hq`) and platform configurations (`/platform`).
3. Advanced Analytics: analytics (`/analytics`) and academic calendar (`/calendar`).
4. Student Success: placements (`/university`), alumni tracking (`/alumni`), and international (`/international`).
5. Daily Utilities: storage (`/documents`) and daily logs (`/diary`).

Please execute the following technical changes by delegating to workers:
- **Daily Utilities Drizzle Schema**:
  Create the Drizzle schema file `apps/web/src/lib/db/schema/diary.ts` defining `diary_entries` and `appointments` tables (matching columns used in their services and SQL inserts in `insert_e2e_users.sql`).
  Export this schema from `apps/web/src/lib/db/schema/index.ts`.
  Run `npx drizzle-kit push` via a worker to synchronize the changes directly to the database.
- **Financial & Treasury fixes & wiring**:
  In `apps/web/src/lib/actions/treasury.ts`, add `tenant_id` isolation filter to `getTreasurySummaryAction` when aggregating overdue and outstanding invoices.
  In `/api/integrations/tally/vouchers/route.ts`, fix the SQL query to select `p.transaction_id AS "provider_reference"` or remove the non-existent `p.provider_reference` column selection.
  Wire `/treasury` ledgers, exceptions list, and `/integrations/tally` export client component to live database actions.
- **HQ & Multi-Tenant fixes & wiring**:
  In `apps/web/src/lib/actions/hq.ts`, remove selection of non-existent `updated_at` from `hq_groups` query.
  In `hq/broadcasts/page.tsx`, fix casing mismatch (use camelCase aliases or correct names in client-page.tsx), and remove non-existent `updated_at` from `platform_broadcasts` query.
  In `hq/leads/page.tsx`, fix casing mismatch so fields align with snake_case accessed by `hq/leads/client-page.tsx`.
  In `hq/treasury/page.tsx`, change `payment_method` to `method` in query.
  In `updateCompanySettingsAction` in `lib/actions/platform.ts`, pass `activeModules` as native array instead of JSON string to companies table `active_modules` text array.
  Wire settings config parameters, tenant list (impersonation, suspension), platform broadcasts, and leads tracking to backend database.
- **Advanced Analytics wiring**:
  Wire `/analytics` metrics (attendance, grades, low stock) and `/calendar` academic events.
- **Student Success fixes & wiring**:
  In `higher_ed.ts`, remove selection of non-existent `updated_at` from `university_programs` query.
  In `alumni.ts` (actions), remove selection of non-existent `updated_at` from `alumni_profiles` and `alumni_events`.
  In `alumni.service.ts`, use `alumni_profiles` instead of `alumni` and correct columns (`current_company`, `location`, `is_verified`).
  Implement actions for `/international` student operations (visas, host families, placements).
  Wire `/university` (degree programs, workload counts), `/alumni` tracking, and `/international` pages.
- **Daily Utilities wiring**:
  Wire `/documents` (verify checklist status changes) and `/diary` (homework logs) to database.

Verify the work by running builds (`npm run build`) and E2E tests (`pnpm --filter @school-sis/web test:e2e --workers=1`) to confirm all 120 tests pass. Also run the Forensic Auditor to verify a CLEAN verdict.

Please initialize your briefing, plan, and progress files inside `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl_gen3/` and report back when finished.
