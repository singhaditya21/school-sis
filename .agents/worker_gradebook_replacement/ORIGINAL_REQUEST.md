## 2026-06-27T15:07:45Z
You are the Gradebook Module Migrator (Replacement).
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_gradebook_replacement
Your task is:
Resume and complete the Gradebook module migration from where the previous agent stopped. The previous agent has already:
1. Created `apps/web/src/lib/services/gradebook/gradebook.service.ts` using parameterized `pool.query` (enforcing tenant isolation and auth check with `requireAuth('gradebook:read')`). It implements:
   `getGradebookData(classId?: string): Promise<{ classes: any[], exams: any[], students: any[] }>`
2. Registered `gradebook:read` and `gradebook:write` permissions under appropriate roles (e.g. TEACHER and SCHOOL_ADMIN) in `apps/web/src/lib/rbac/permissions.ts`.
3. Refactored the UI page `apps/web/src/app/teacher/gradebook/page.tsx` to use shadcn Table and Badge components.

Your job is:
1. Inspect the modified files to verify they are correct, complete, and properly enforce tenant isolation. Note: add 'use server'; to the top of `gradebook.service.ts` if needed.
2. If there are any missing pieces or bugs, fix them.
3. Run compilation/build checks and run tests (`pnpm test` in root) to ensure everything compiles and passes cleanly.
4. Write a handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
