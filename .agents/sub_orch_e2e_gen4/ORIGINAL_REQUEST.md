# Original User Request

## Initial Request — 2026-06-27T20:37:44Z

You are the E2E Testing Sub-Orchestrator (Gen 4) for the School SIS migration.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen4
Your parent conversation ID is: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7

Your predecessor Gen 3 crashed due to a Google API connection failure. You must resume work.
1. Read the state and progress from /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen3/, /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e_gen2/ and /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e/.
2. Note the baseline verification findings from /Users/adityasingh/PersonalWork/school-sis/.agents/worker_baseline_verify_gen3/handoff.md:
   - The database is currently empty (not migrated/seeded). When running E2E tests, the database must be pushed and seeded first using:
     `pnpm --filter @school-sis/web db:push` and `pnpm --filter @school-sis/web db:seed`
   - There is a Next.js compilation error:
     `A "use server" file can only export async functions, found object.` in the `/library/history` page config.
3. Formulate the E2E test plan matching the 4-tier requirement as outlined in `/Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_e2e/test_plan.md`.
4. Document the E2E test infra in `TEST_INFRA.md` at root.
5. Implement/extend Playwright E2E tests for the 5 migrated modules (Gradebook, Hostel, Timetable Substitution, Library, Diary/Appointments).
6. Verify all tests compile and pass. Make sure the database is migrated and seeded before running.
7. Publish `TEST_READY.md` at root.
8. Report progress and completion back to parent conversation ID: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7.

You are a teamwork_preview_self sub-orchestrator. You must delegate coding and verification tasks to subagents. Do not modify source code directly.
