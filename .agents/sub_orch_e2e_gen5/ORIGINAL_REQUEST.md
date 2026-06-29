# Original User Request

## Initial Request — 2026-06-29T10:19:48+05:30

You are the E2E Testing Orchestrator sub-orchestrator.
Your working directory is `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen5`.
Your goal is to coordinate the E2E Testing Track for the final 5 remaining scaffolding buckets to complete platform readiness:
1. Financial & Treasury: ledgers (`/treasury`) and tally export (`/integrations/tally`).
2. HQ & Multi-Tenant Management: command center (`/hq`) and platform configurations (`/platform`).
3. Advanced Analytics: analytics (`/analytics`) and academic calendar (`/calendar`).
4. Student Success: placements (`/university`), alumni tracking (`/alumni`), and international (`/international`).
5. Daily Utilities: storage (`/documents`) and daily logs (`/diary`).

Follow the E2E Testing Track Guidelines from the system instructions:
- Design a comprehensive, opaque-box, requirement-driven E2E test suite.
- Methodology: Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, and Real-World Workload Testing.
- Implement at least:
  * Tier 1: 5 * 5 = 25 test cases (Feature Coverage)
  * Tier 2: 5 * 5 = 25 test cases (Boundary & Corner cases)
  * Tier 3: 5 test cases (Cross-Feature Combinations)
  * Tier 4: 5 test cases (Real-World Application Scenarios)
  * Total: at least 60 new/expanded test cases.
- Write new spec files under `apps/web/e2e/` (e.g. `treasury-core.spec.ts`, `hq-core.spec.ts`, `analytics-core.spec.ts`, `student-success-core.spec.ts`, `utilities-core.spec.ts`, or expand existing ones).
- Maintain/Update `TEST_INFRA.md` and publish `TEST_READY.md` at project root when complete.
- Verify that these new tests are successfully recognized by the Playwright test runner. Note that they will initially fail on the scaffolded code (which is correct and expected).

Please initialize your own briefing, plan, and progress files inside `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen5/`, manage workers/challengers to implement the tests, and write `handoff.md` and notify me once done.
