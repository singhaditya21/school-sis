## 2026-06-28T12:22:00Z
You are a Worker agent. Your task is to complete Milestone 2: Write `TEST_INFRA.md` at the project root and implement the E2E tests for the Hostel module.

Specific tasks:
1. Write `TEST_INFRA.md` at the project root (`/Users/adityasingh/PersonalWork/school-sis/TEST_INFRA.md`) following the user-provided structure. It must outline:
   - Test Philosophy: Opaque-box, requirement-driven.
   - Feature Inventory: Identify features for Hostel, Transport, Timetable, Library, Inventory.
   - Test Architecture: Playwright test runner, test locations, DB query utility.
   - Real-World Application Scenarios (Tier 4 list).
   - Coverage Thresholds: Tier 1 (>=5/module), Tier 2 (>=5/module), Tier 3 (>=5 total), Tier 4 (>=5 total).
2. Create and implement `apps/web/e2e/hostel-core.spec.ts` with the 12 Hostel-related tests:
   - **E2E-HS-101**: Hostel Dashboard loading and KPI cards (Total Hostels, Total Beds, Occupied, Available, Occupancy).
   - **E2E-HS-102**: View active allocations table.
   - **E2E-HS-103**: Filter hostel fees by status paid.
   - **E2E-HS-104**: Filter hostel fees by fee type mess.
   - **E2E-HS-105**: Clear hostel fees filters.
   - **E2E-HS-201**: Fee list empty state with overdue filter.
   - **E2E-HS-202**: Unauthenticated user redirection to login.
   - **E2E-HS-203**: Access restricted for Parent role (redirects to unauthorized).
   - **E2E-HS-204**: Occupancy Rate displays "0%" when there are no active allocations.
   - **E2E-HS-205**: Verify Mess Menu weekly meal scheduler display (e.g. days sorted Monday-Sunday).
   - **E2E-COM-301**: Hostel Room Allocation triggers Hostel Fee Creation (Cross-Feature).
   - **E2E-WRK-401**: Hostel Vacating & Waitlist Reallocation workflow (Real-World Workload).
3. Ensure these tests use Playwright properly, login using the helper functions (like `loginAsAdmin`, `loginAsParent`), and check the database correctly using a PG Pool `runQuery` utility or direct Drizzle operations. Note that you can look at `apps/web/e2e/migrated-modules.spec.ts` for reference on how login helpers and db queries are set up.
4. Run the test command to verify that your new tests run and pass:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/hostel-core.spec.ts`
5. Write your handoff.md in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_hostel/` with the results of your implementation, and send a message back to parent (sub_orch_e2e, conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) notifying them of completion.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
