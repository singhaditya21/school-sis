## 2026-06-27T14:45:35Z
You are the Library Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_library
Your task is:
1. Update `apps/web/src/lib/services/library/library.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. It must implement the contracts:
   `getLibraryStudents(): Promise<any[]>`
   `getLibraryHistory(): Promise<any[]>` (migrate this from the history page's inline query)
   Ensure it checks auth and permissions using `requireAuth('library:read')` from `@/lib/auth/middleware`.
2. In `apps/web/src/lib/rbac/permissions.ts`, ensure `library:read` and `library:write` are registered under the appropriate roles (e.g. `SCHOOL_ADMIN`).
3. Refactor frontend pages:
   - `apps/web/src/app/(admin)/library/issue/page.tsx`: replace legacy HTML table elements with shadcn Table components imported from `@/components/ui/table`. Also use `<Badge>` from `@/components/ui/badge`. Update imports to call the new service.
   - `apps/web/src/app/(admin)/library/history/page.tsx`: replace inline SQL query with the call to the new service `getLibraryHistory()`. Also replace the legacy HTML table elements with shadcn Table components.
4. Run compilation/build checks to verify no TypeScript errors are introduced.
