## 2026-06-27T14:45:35Z
You are the Hostel Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_hostel
Your task is:
1. Update `apps/web/src/lib/services/hostel/hostel.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. It must implement the contract:
   `getHostelFees(status?: string, feeType?: string): Promise<any[]>`
   Check auth and permissions using `requireAuth('hostel:read')` from `@/lib/auth/middleware` (or make it compatible with client/server boundary by adding 'use server'; if needed).
2. In `apps/web/src/lib/rbac/permissions.ts`, ensure `hostel:read` and `hostel:write` are registered under the appropriate roles (e.g. `SCHOOL_ADMIN`).
3. In `apps/web/src/app/(admin)/hostel/fees/page.tsx`, replace the legacy HTML `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` tags with shadcn Table components imported from `@/components/ui/table`. Also use `<Badge>` from `@/components/ui/badge` for the status and fee type badges. Update imports to call the new backend service (you may import it directly from the service file if it is marked 'use server', or define/wrap it in an action).
4. Run compilation/build checks to verify no TypeScript errors are introduced.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
