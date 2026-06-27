## 2026-06-27T20:15:35+05:30
You are the Diary and Appointments Module Migrator.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_diary_appts
Your task is:
1. Create `apps/web/src/lib/services/diary/diary.service.ts` and `apps/web/src/lib/services/appointments/appointments.service.ts` using parameterized `pool.query` (imported from `@/lib/db`) and enforcing tenant isolation. They must implement the contracts:
   - Diary Service: `getDiaryEntries(): Promise<any[]>`
   - Appointments Service: `getAppointments(): Promise<any[]>`
   Ensure they check auth and permissions using `requireAuth('diary:read')` and `requireAuth('appointments:read')` respectively.
2. In `apps/web/src/lib/rbac/permissions.ts`, ensure `diary:read`, `diary:write`, `appointments:read`, and `appointments:write` are registered under the appropriate roles (e.g. `SCHOOL_ADMIN`).
3. Refactor frontend pages:
   - `apps/web/src/app/(admin)/diary/page.tsx`: update imports to call the new service.
   - `apps/web/src/app/(admin)/appointments/page.tsx`: update imports to call the new service.
4. Run compilation/build checks to verify no TypeScript errors are introduced.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
