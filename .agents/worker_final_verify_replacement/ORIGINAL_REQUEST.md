## 2026-06-27T16:03:50Z
You are worker_final_verify_replacement.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_final_verify_replacement
Your mission is to resume the final verification of the School SIS migration. Your predecessor (worker_final_verify) hung during Playwright E2E tests.

Detailed steps to execute:
1. Ensure the database is pushed and seeded:
   - Run: `pnpm --filter @school-sis/web db:push`
   - Run: `pnpm --filter @school-sis/web db:seed`
2. Run the production build to ensure clean compilation:
   - Run: `pnpm --filter @school-sis/web build`
3. Run the unit tests:
   - Run: `pnpm --filter @school-sis/web test`
4. Run the Playwright E2E tests (as described in TEST_READY.md):
   - Run: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/migrated-modules.spec.ts`
5. Collect all command outputs and results. Write a detailed handoff.md in your working directory summarizing:
   - DB seed results
   - Build results
   - Unit test results
   - Playwright E2E test results

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
