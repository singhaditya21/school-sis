## 2026-06-28T07:26:27Z

You are a Worker agent. Your task is to complete Milestone 5: Implement E2E tests for the Library module.

Specific tasks:
1. Create and implement `apps/web/e2e/library-core.spec.ts` with the 12 Library-related tests:
   - **E2E-LB-101**: View Books Catalog table.
   - **E2E-LB-102**: Switch Library Issue/Return Modes (Switch tabs/buttons between issue book panel and return book panel).
   - **E2E-LB-103**: Catalog Search Filtering (Filter books dropdown by title or ISBN keyword input).
   - **E2E-LB-104**: Issue Book Form Submission (Issue book to student and assert "successfully issued" message).
   - **E2E-LB-105**: Return Book Form Submission (Return book and assert "returned successfully" message).
   - **E2E-LB-201**: Issue book validator blocks empty book select (Assert "Please select both book and student" warning).
   - **E2E-LB-202**: Issue book validator blocks empty student select (Assert "Please select both book and student" warning).
   - **E2E-LB-203**: Search box keyword returns no matching catalog titles (Dropdown lists only placeholder option).
   - **E2E-LB-204**: Issue book validator blocks student with missing user account (Verify warning is shown).
   - **E2E-LB-205**: Borrowing history filters search with zero matches (Verify "No borrowing records found." is displayed).
   - **E2E-COM-304**: Library Overdue return triggers unpaid fine addition (Cross-Feature: Seed checkout return date 5 days past due date in DB -> Return book -> Verify fine added to student's outstanding fees).
   - **E2E-WRK-403**: Monthly Library Overdue Audit & Fine Recovery loop (Real-World Workload: audit overdue borrow logs, return overdue book, verify book copy available increments, assert outstanding fines update).
2. Examine Next.js routes under `apps/web/src/app/(admin)/library`, server actions in `src/lib/actions/library.ts` and `src/lib/services/library/library.service.ts`, and schema in `src/lib/db/schema/library.ts`. If the UI forms/pages lack implementation (e.g. form submission buttons or inputs that are static placeholder layouts), please make necessary changes to the frontend and backend files (actions, pages) to make them fully functional and testable.
3. Ensure these tests use Playwright properly, login using the helper functions (like `loginAsAdmin`), and check the database correctly using a PG Pool `runQuery` utility or direct Drizzle operations.
4. Run the test command to verify that your new tests run and pass:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/library-core.spec.ts --workers=1`
5. Write your handoff.md in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_library/` with the results of your implementation, and send a message back to parent (sub_orch_e2e, conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) notifying them of completion.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
