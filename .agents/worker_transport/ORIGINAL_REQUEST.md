## 2026-06-28T07:02:10Z

You are a Worker agent. Your task is to complete Milestone 3: Implement E2E tests for the Transport module.

Specific tasks:
1. Create and implement `apps/web/e2e/transport-core.spec.ts` with the 11 Transport-related tests:
   - **E2E-TR-101**: View Configured Routes List (Verify card displays route name, stops count, monthly fee).
   - **E2E-TR-102**: Open Create Route Form (Verify click "+ Add Route" navigates to `/transport/new` and fields are visible).
   - **E2E-TR-103**: Cancel Route Creation (Verify clicking "Cancel" in `/transport/new` returns to `/transport`).
   - **E2E-TR-104**: Parent Portal My Transport Assigned View (Verify parent sees assigned route cards).
   - **E2E-TR-105**: Verify Empty Routes Placeholder (Delete all routes from DB, navigate to `/transport`, assert "No routes configured yet." message is shown).
   - **E2E-TR-201**: Route Create Input Validations (Verify empty inputs block submission).
   - **E2E-TR-202**: Unassigned Parent Transport View (Verify student with no route shows "No transport assigned.").
   - **E2E-TR-203**: Invalid Route Details Parameter handling (Navigate to `/transport/non-existent-uuid` and verify graceful redirect/fallback).
   - **E2E-TR-204**: Transport Route Access Restricted for Teacher Role (Verify teacher is redirected to `/unauthorized`).
   - **E2E-TR-205**: Driver phone format inputs validation (Verify non-numeric phone format warning or block).
   - **E2E-COM-302**: Student Transport route assignment integrates transport fee (Cross-Feature).
2. Ensure you examine the Next.js routes under `apps/web/src/app/(admin)/transport` and `(parent)/my-transport` and corresponding server actions in `src/lib/actions/transport.ts` and `src/lib/db/schema/transport.ts`. If the UI forms/pages lack implementation (e.g. form submission buttons or inputs that are static placeholder layouts), please make necessary changes to the frontend and backend files (actions, pages) to make them fully functional and testable, just like the Hostel worker did.
3. Ensure these tests use Playwright properly, login using the helper functions (like `loginAsAdmin`, `loginAsParent`), and check the database correctly using a PG Pool `runQuery` utility or direct Drizzle operations.
4. Run the test command to verify that your new tests run and pass:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/transport-core.spec.ts --workers=1`
5. Write your handoff.md in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_transport/` with the results of your implementation, and send a message back to parent (sub_orch_e2e, conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) notifying them of completion.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
