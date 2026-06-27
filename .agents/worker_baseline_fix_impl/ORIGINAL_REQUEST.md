## 2026-06-27T15:10:06Z
You are worker_baseline_fix_impl.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_baseline_fix_impl
Your mission is to compile the School SIS codebase, fix any Next.js Server Actions compiler errors in the backend services, clean up scaffolding-bridge.ts, and run unit tests.

Detailed Steps:
1. Inspect the 6 services:
   - apps/web/src/lib/services/hostel/hostel.service.ts
   - apps/web/src/lib/services/library/library.service.ts
   - apps/web/src/lib/services/timetable/timetable.service.ts
   - apps/web/src/lib/services/diary/diary.service.ts
   - apps/web/src/lib/services/appointments/appointments.service.ts
   - apps/web/src/lib/services/gradebook/gradebook.service.ts
2. Address compile errors:
   - Next.js Server Actions files (marked with 'use server' at the top) CANNOT export objects (like `export const HostelService = { ... }`). They must export individual async functions (e.g. `export async function getHostels(...)`).
   - If a service has 'use server' but is only imported in Server Components, remove the 'use server' directive.
   - If a service has 'use server' and is imported in Client Components (like `getHostelFees` in `hostel.service.ts` is imported in `fees/page.tsx`), you must keep 'use server' but ensure NO objects are exported. Refactor the object exports (like `HostelService`) into individual async functions, and update their imports/calls in the codebase.
3. Clean up `apps/web/src/lib/actions/scaffolding-bridge.ts`.
4. Run compilation (`pnpm --filter @school-sis/web build`) and unit tests (`pnpm --filter @school-sis/web test`).
5. Write your handoff.md in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
