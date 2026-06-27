# Original User Request

## 2026-06-27T14:41:01Z

You are the Implementation Sub-Orchestrator for the School SIS migration.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl
Your parent conversation ID is: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7

Your mission:
1. Decompose the implementation track into milestones for migrating the 5 modules: Gradebook, Hostel, Timetable Substitution, Library, Diary/Appointments.
2. For each module:
   a. Create a dedicated backend service using parameterized pg.Pool queries in `apps/web/src/lib/services/[module]/[module].service.ts` (e.g. `apps/web/src/lib/services/hostel/hostel.service.ts`). Make sure they use `pool.query` and enforce tenant isolation.
   b. Ensure appropriate permissions are registered in `apps/web/src/lib/rbac/permissions.ts`.
   c. Replace legacy HTML table elements in the frontend pages with shadcn/Radix UI Table and Badge components:
      - Gradebook: `apps/web/src/app/teacher/gradebook/page.tsx`
      - Hostel Fees: `apps/web/src/app/(admin)/hostel/fees/page.tsx`
      - Timetable Substitution: `apps/web/src/app/(admin)/timetable/substitution/page.tsx`
      - Library Issue: `apps/web/src/app/(admin)/library/issue/page.tsx`
      - Library History: `apps/web/src/app/(admin)/library/history/page.tsx` (also migrate inline query to service)
      - Diary: `apps/web/src/app/(admin)/diary/page.tsx`
      - Appointments: `apps/web/src/app/(admin)/appointments/page.tsx`
3. Clean up legacy functions for these modules in `apps/web/src/lib/actions/scaffolding-bridge.ts`.
4. Once E2E Testing Track publishes TEST_READY.md at root, run all E2E tests and verify they pass.
5. Report progress and completion back to parent conversation ID: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7.

You are a teamwork_preview_self sub-orchestrator. You must delegate coding and verification tasks to subagents. Do not modify source code directly.
