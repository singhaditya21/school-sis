## 2026-06-29T10:21:11+05:30
You are the E2E Test Suite Worker.
Your working directory is `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_e2e_scaffolding_gen5`.

## Objective
Write and verify the E2E test suite for the remaining 5 scaffolding buckets of the School SIS:
1. Financial & Treasury: ledgers (`/treasury`) and tally export (`/integrations/tally`) -> `apps/web/e2e/treasury-core.spec.ts`
2. HQ & Multi-Tenant Management: command center (`/hq`) and platform configurations (`/platform`) -> `apps/web/e2e/hq-core.spec.ts`
3. Advanced Analytics: analytics (`/analytics`) and academic calendar (`/calendar`) -> `apps/web/e2e/analytics-core.spec.ts`
4. Student Success: placements (`/university`), alumni tracking (`/alumni`), and international (`/international`) -> `apps/web/e2e/student-success-core.spec.ts`
5. Daily Utilities: storage (`/documents`) and daily logs (`/diary`) -> `apps/web/e2e/utilities-core.spec.ts`

## Requirements
1. Implement exactly 60 new/expanded tests.
   - Tier 1: 5 * 5 = 25 test cases (Feature Coverage)
   - Tier 2: 5 * 5 = 25 test cases (Boundary & Corner cases)
   - Tier 3: 5 test cases (Cross-Feature Combinations)
   - Tier 4: 5 test cases (Real-World Application Scenarios)
   - Total: 60 new tests.
2. Read the SCOPE.md at `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen5/SCOPE.md` for the exact test case IDs and descriptions.
3. Update `/Users/adityasingh/PersonalWork/school-sis/TEST_INFRA.md` to document the new features, scenarios, and total thresholds (from 60 to 120 total tests).
4. Create the 5 new spec files in `apps/web/e2e/`:
   - `treasury-core.spec.ts`
   - `hq-core.spec.ts`
   - `analytics-core.spec.ts`
   - `student-success-core.spec.ts`
   - `utilities-core.spec.ts`
5. Ensure all test cases contain actual logic, correct page locators based on the UI implementation, standard auth login via `loginAsAdmin` or `loginAsParent`, database resets/seeding where needed using `Pool` from `pg` or direct DB access, and meaningful assertions.
6. Verify the new tests are successfully recognized by the Playwright test runner. Run a command like:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/treasury-core.spec.ts e2e/hq-core.spec.ts e2e/analytics-core.spec.ts e2e/student-success-core.spec.ts e2e/utilities-core.spec.ts --workers=1`
   Verify they are recognized, note their failure on scaffolded/unimplemented code (which is correct and expected), and capture the output.
7. Write and publish `TEST_READY.md` at the project root with the complete test checklist and current status. Include both the existing 60 tests (Hostel, Transport, Timetable, Library, Inventory) and the 60 new/expanded tests (Treasury, HQ, Analytics, Student Success, Utilities), total 120 tests.
8. Update `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_e2e_scaffolding_gen5/progress.md` with your progress after every step.
9. Deliver your final handoff report at `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_e2e_scaffolding_gen5/handoff.md`.

## Scope Boundaries
- Do NOT rewrite or modify the existing 5 spec files (`hostel-core.spec.ts`, `transport-core.spec.ts`, `timetable-core.spec.ts`, `library-core.spec.ts`, `inventory-core.spec.ts`).
- Do NOT change the backend code or UI pages themselves (we are only implementing the E2E tests).

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
