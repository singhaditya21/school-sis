## 2026-06-27T20:37:27Z
You are the Library Module Migrator (Replacement).
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_library_replacement
Your task is:
Resume and complete the Library module migration from where the previous agent stopped. The previous agent has already:
1. Updated/Created `apps/web/src/lib/services/library/library.service.ts` using parameterized `pool.query` (enforcing tenant isolation and auth check with `requireAuth('library:read')`). It must implement:
   `getLibraryStudents(): Promise<any[]>`
   `getLibraryHistory(): Promise<any[]>`
2. Registered `library:read` and `library:write` permissions under `SCHOOL_ADMIN` in `apps/web/src/lib/rbac/permissions.ts`.
3. Refactored the UI pages:
   - `apps/web/src/app/(admin)/library/issue/page.tsx`
   - `apps/web/src/app/(admin)/library/history/page.tsx`
   to use shadcn Table and Badge components and call the new service.

Your job is:
1. Inspect the modified files to verify they are correct, complete, and properly enforce tenant isolation.
2. If there are any missing pieces or bugs, fix them.
3. Run compilation/build checks and run tests (`pnpm test` in root) to ensure everything compiles and passes cleanly.
4. Write a handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
