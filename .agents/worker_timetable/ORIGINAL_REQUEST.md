## 2026-06-27T14:45:35Z
You are the Timetable Substitution Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_timetable
Your task is:
1. Create/update `apps/web/src/lib/services/timetable/timetable.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. It must implement the contracts:
   `getSubstitutionTeachers(): Promise<any[]>`
   `getSubstitutionRequests(): Promise<any[]>`
   Check auth and permissions using `requireAuth('timetable:read')` or `substitution:read` from `@/lib/auth/middleware`.
2. In `apps/web/src/lib/rbac/permissions.ts`, ensure appropriate permissions for substitution and timetable are registered under the appropriate roles (e.g. `TEACHER` and `SCHOOL_ADMIN`).
3. In `apps/web/src/app/(admin)/timetable/substitution/page.tsx`, replace the legacy HTML `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` tags with shadcn Table components imported from `@/components/ui/table`. Also use `<Badge>` from `@/components/ui/badge` for status/class formatting. Update imports to call the new service.
4. Run compilation/build checks to verify no TypeScript errors are introduced.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-06-28T12:46:02Z
You are a Worker agent. Your task is to complete Milestone 4: Implement E2E tests for the Timetable module.

Specific tasks:
1. Create and implement `apps/web/e2e/timetable-core.spec.ts` with the 13 Timetable-related tests:
   - **E2E-TT-101**: View Timetable Section Dashboard (Locate classes/sections grouped by grade and verify links).
   - **E2E-TT-102**: Load Substitution Dashboard Statistics (Verify 4 KPI cards: Today's, Pending, Absent, Available show correct numbers).
   - **E2E-TT-103**: Open Create Substitution Dialog (Verify click "+ New Substitution" opens modal).
   - **E2E-TT-104**: View Absent Teachers list (Verify absent teachers card has entries).
   - **E2E-TT-105**: Timetable Grid Placeholder Check (Verify days Monday-Saturday and periods show click-to-assign and integration disclaimer).
   - **E2E-TT-201**: Substitution Form validation error on empty submit (Verify error warning when submitting empty dialog).
   - **E2E-TT-202**: Dialog missing subject validation (Verify dialog remains open if subject input is left blank).
   - **E2E-TT-203**: Timetable Entry Teacher Double-Booking Check (Submit a timetable entry where teacher is already booked, verify it returns error conflict code/alert).
   - **E2E-TT-204**: Timetable Entry Room Double-Booking Check (Submit a timetable entry where room is already booked, verify it returns conflict code/alert).
   - **E2E-TT-205**: Substitution details invalid id routing (Verify page handles `/timetable/substitution/detail/invalid-uuid` gracefully).
   - **E2E-COM-303**: Timetable Substitution Request approval updates teacher schedule (Cross-Feature: Admin approves substitution -> teacher sees it in schedule).
   - **E2E-WRK-403**: Start-of-Day Absenteeism Substitution routing (Real-World Workload: login as admin, select absent teacher, identify available substitutes, assign request, verify updates).
   - **E2E-WRK-405**: New Term Class Period Schedule Bulk Uploading (Real-World Workload: import timetable mappings, resolve conflicts, finalize and check grid updates).
2. Examine Next.js routes under `apps/web/src/app/(admin)/timetable`, server actions in `src/lib/actions/timetable.ts` and `src/lib/services/timetable/timetable.service.ts`, and schema in `src/lib/db/schema/timetable.ts`. If the UI forms/pages lack implementation (e.g. form submission buttons or inputs that are static placeholder layouts), please make necessary changes to the frontend and backend files (actions, pages) to make them fully functional and testable.
3. Ensure these tests use Playwright properly, login using the helper functions (like `loginAsAdmin`, `loginAsTeacher`), and check the database correctly using a PG Pool `runQuery` utility or direct Drizzle operations.
4. Run the test command to verify that your new tests run and pass:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/timetable-core.spec.ts --workers=1`
5. Write your handoff.md in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_timetable/` with the results of your implementation, and send a message back to parent (sub_orch_e2e, conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) notifying them of completion.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
