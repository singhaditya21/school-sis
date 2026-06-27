## 2026-06-27T20:48:43Z
You are a teamwork_preview_worker.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_baseline_fix_gen4_replacement
Your role is to fix the Next.js compilation error and set up the database so E2E tests can compile and start successfully.

Objective:
1. Fix the Next.js compilation error:
   `A "use server" file can only export async functions, found object.` in the `/library/history` page config.
   Identify which file is causing this error, modify it to export only async functions, and verify that the error is resolved.
2. Push and seed the database using the following commands:
   `pnpm --filter @school-sis/web db:push`
   `pnpm --filter @school-sis/web db:seed`
   Verify that the database is successfully pushed and seeded.
3. Run the Next.js build to verify that the compilation error is resolved:
   `pnpm --filter @school-sis/web build`
4. Run the baseline Playwright E2E tests to verify they can execute (they don't all have to pass yet, but they should not fail due to compilation or empty database/connection refuse):
   `pnpm --filter @school-sis/web test:e2e`
5. Write a handoff report in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_baseline_fix_gen4_replacement/handoff.md` summarizing:
   - What the compilation error was and how you fixed it.
   - Database push/seed command outputs.
   - Build compilation verification results.
   - Baseline E2E test results (with command outputs).

Scope boundaries:
- Do not write new Playwright E2E tests yet. Just fix the compilation error and set up the database.
- Do not make changes to other pages unless necessary to fix the compilation error.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report back when done.
