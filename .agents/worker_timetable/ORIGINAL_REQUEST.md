## 2026-06-27T14:45:35Z
You are the Timetable Substitution Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_timetable
Your task is:
1. Create/update `apps/web/src/lib/services/timetable/timetable.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. It must implement the contracts:
   `getSubstitutionTeachers(): Promise<any[]>`
   `getSubstitutionRequests(): Promise<any[]>`
   Check auth and permissions using `requireAuth('timetable:read')` or `substitution:read` from `@/lib/auth/middleware`.
2. In `apps/web/src/lib/rbac/permissions.ts`, ensure appropriate permissions for substitution and timetable are registered under the appropriate roles (e.g. `TEACHER` and `SCHOOL_ADMIN`).
3. In `apps/web/src/app/(admin)/timetable/substitution/page.tsx`, replace the legacy HTML `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` tags with shadcn Table components imported from `@/components/ui/table`. Also use `<Badge>` from `@/components/ui/badge` for status/class formatting. Update imports to call the new service.
4. Run compilation/build checks to verify no TypeScript errors are introduced.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
