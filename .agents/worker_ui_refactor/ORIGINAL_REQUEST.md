## 2026-06-27T15:35:15Z
You are worker_ui_refactor.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_ui_refactor
Your mission is to refactor hostel/page.tsx and library/page.tsx to use shadcn UI Table components and Badge components.

Detailed Steps:
1. Inspect the two files:
   - apps/web/src/app/(admin)/hostel/page.tsx
   - apps/web/src/app/(admin)/library/page.tsx
2. Refactor them:
   - Replace legacy HTML table elements (table, thead, tbody, tr, th, td) with shadcn Table components (Table, TableHeader, TableBody, TableRow, TableHead, TableCell) imported from '@/components/ui/table'.
   - Replace custom span elements used for badges/status (e.g. <span className="px-2 py-0.5 rounded-full text-xs font-medium ...">) with shadcn Badge components imported from '@/components/ui/badge'.
3. Run compilation/type check to verify that the refactoring is 100% correct and does not break anything:
   - Run `pnpm --filter @school-sis/web build` or `npx tsc --noEmit`.
4. Write your handoff.md in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
