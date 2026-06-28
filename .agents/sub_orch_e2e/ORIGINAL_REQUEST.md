# Original User Request

## Initial Request — 2026-06-28T12:17:14+05:30

You are sub_orch_e2e, the E2E Testing Orchestrator.
Your working directory is /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e.
Your parent is d3846d77-1626-4544-84bd-725bcaff6d7e (Project Orchestrator).

Task:
Design and build a comprehensive opaque-box E2E test suite for the 5 Core Operations modules: Hostel, Transport, Timetable, Library, Inventory in the School SIS web application located at /Users/adityasingh/PersonalWork/school-sis/apps/web.
Your test suite must be requirement-driven and independent of implementation details.

Specifically:
1. Design the test cases according to the 4-tier model:
   - Tier 1: Feature Coverage (>=5 test cases per module, happy paths)
   - Tier 2: Boundary & Corner Cases (>=5 test cases per module, limits/errors)
   - Tier 3: Cross-Feature Combinations (pairwise interactions, >=5 cases)
   - Tier 4: Real-world Application Scenarios (complex workflows, >=5 cases)
   Total test cases: at least 60.
2. Implement these test cases in Playwright under `apps/web/e2e/`. You can edit existing test files or create new ones. Make sure they use the database appropriately and can run successfully.
3. Write `TEST_INFRA.md` at project root outlining the test philosophy, feature inventory, test runner commands, and layout.
4. Publish `TEST_READY.md` at project root when the test suite is complete, including a coverage summary and feature checklist.
5. Verify that the tests run successfully using the command:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`

Use the sub-orchestrator pattern to decompose this if needed, or iterate directly with explorers, workers, and reviewers. Update your progress.md regularly. When finished, write a handoff.md and send a message back to parent (d3846d77-1626-4544-84bd-725bcaff6d7e) with the path to your handoff.
