# Handoff Report: Scaffolding Bridge Migration Exploration

## 1. Observation
- Located `scaffolding-bridge.ts` at `/Users/adityasingh/PersonalWork/school-sis/apps/web/src/lib/actions/scaffolding-bridge.ts`. It exports functions querying `hostel_fees` (line 11), `students` (line 43), `users` (line 56), `substitution_requests` (line 66), `diary_entries` (line 83), `appointments` (line 98), and `grades`/`exams` (line 122).
- Located database configuration at `/Users/adityasingh/PersonalWork/school-sis/apps/web/src/lib/db/index.ts`. It implements a pg `Pool` (line 37) and a transaction wrapper `withTenant` (line 49) which configures row-level security using `set_config('app.current_tenant', $1, true)` (line 57).
- Checked database migrations in `/Users/adityasingh/PersonalWork/school-sis/apps/web/drizzle/0000_init_native_postgres.sql`.
  - Found tables `hostels` (line 794), `hostel_rooms` (line 780), `hostel_allocations` (line 766), `books` (line 713), `book_issues` (line 683), `book_reservations` (line 702), and `substitutions` (line 392).
  - Did NOT find definitions for `hostel_fees`, `diary_entries`, `appointments`, or `substitution_requests`.
  - Did NOT find any reference schema directory `./src/lib/db/schema` referenced by `drizzle.config.ts`.
- Inspected parent portal reference page at `/Users/adityasingh/PersonalWork/school-sis/apps/web/src/app/(parent)/my-results/page.tsx` and service at `/Users/adityasingh/PersonalWork/school-sis/apps/web/src/lib/services/parent/parent.service.ts`.
  - Service uses `requireAuth('parent:read')` (line 99) and queries the database via `pool.query`.
  - Frontend page (lines 110–140) uses shadcn table components (`@/components/ui/table`) and Badge components (`@/components/ui/badge`) for formatting.
  - Page fetches data using `getMyResults()` inside a client-side `useEffect` hook.

## 2. Logic Chain
- Since `scaffolding-bridge.ts` contains queries to tables like `hostel_fees`, `diary_entries`, `appointments`, and `substitution_requests` which do not exist in the primary Drizzle migration `0000_init_native_postgres.sql`, these tables must be created or mock seeds must be established before deprecating the scaffolding bridge.
- In `teacher/gradebook/page.tsx`, the data fetching is already handled by `getAdvancedGradebook` inside `lib/actions/exams.ts`, which bypasses the scaffolding bridge entirely. Thus, `getGradebookData` is redundant and can be safely deleted.
- Timetable substitution scaffolding queries a non-existent `substitution_requests` table, but a `substitutions` table exists in the schema. The migrated action should query `substitutions` and perform the necessary joins on `timetable_entries` and `periods` to obtain the missing fields.
- The remaining client pages (`(admin)/hostel/fees/page.tsx`, `(admin)/timetable/substitution/page.tsx`, `(admin)/library/issue/page.tsx`, `(admin)/diary/page.tsx`, and `(admin)/appointments/page.tsx`) can be migrated following the Parent Portal pattern of importing dedicated modular Server Actions with session context protection (`requireAuth`) and utilizing shadcn UI Table and Badge elements.

## 3. Caveats
- Direct access to a running database instance was not available during this investigation. As a result, we could not confirm whether tables like `hostel_fees`, `diary_entries`, and `appointments` are actively present in the target database environment despite being missing from the main SQL migration file.
- We assumed that permissions like `diary:read` and `appointments:read` should be added to the RBAC matrix, as they are not explicitly present under the `SCHOOL_ADMIN` or `TEACHER` lists in `apps/web/src/lib/rbac/permissions.ts`.

## 4. Conclusion
- Preparation for migrating the 5 modules off `scaffolding-bridge.ts` is complete. The details are documented in `/Users/adityasingh/PersonalWork/school-sis/.agents/explorer_investigate/analysis.md`.
- Gradebook is already migrated. Hostel Fees, Timetable Substitution, Library, Diary, and Appointments should have their actions moved to modular files in `lib/actions/` utilizing the `requireAuth` helper and querying the correct database tables.

## 5. Verification Method
- **Files to Inspect**:
  - `apps/web/src/lib/actions/scaffolding-bridge.ts` - Check current scaffolded function definitions.
  - `apps/web/src/lib/db/index.ts` - Inspect pool configuration and `withTenant` context isolation.
  - `/Users/adityasingh/PersonalWork/school-sis/.agents/explorer_investigate/analysis.md` - Inspect the comprehensive migration analysis report.
- **Invalidation Conditions**:
  - The migration plan is invalidated if the target database does not have the `substitutions` or `books` tables, or if permissions in `lib/rbac/permissions.ts` cannot be expanded to include the new resources.
