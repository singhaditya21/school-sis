## 2026-06-27T14:45:25Z
You are the Gradebook Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_gradebook
Your task is:
1. Create `apps/web/src/lib/services/gradebook/gradebook.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. It must implement the contract:
   `getGradebookData(classId?: string): Promise<{ classes: any[], exams: any[], students: any[] }>`
   Check auth and permissions using `requireAuth('gradebook:read')` from `@/lib/auth/middleware`.
2. In `apps/web/src/lib/rbac/permissions.ts`, register `gradebook:read` and `gradebook:write` permissions. Assign them to appropriate roles like `TEACHER` and `SCHOOL_ADMIN`.
3. In `apps/web/src/app/teacher/gradebook/page.tsx`, replace the legacy HTML `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` tags with shadcn Table components: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` imported from `@/components/ui/table`. Also use `<Badge>` from `@/components/ui/badge` for formatting grades.
4. Run npm run build or other compile checks to verify there are no TypeScript or compilation errors.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
