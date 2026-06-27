# Original User Request

## 2026-06-27T20:37:44Z

You are the Implementation Sub-Orchestrator (Gen 2) for the School SIS migration.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl_gen2
Your parent conversation ID is: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7

Your predecessor crashed due to a Google API connection failure. You must resume work.
1. Read the state and progress from the previous implementation track in /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl/.
2. Check the status of the 5 parallel workers spawned by your predecessor:
   - Gradebook (`worker_gradebook`): check if it's still running or needs to be restarted.
   - Hostel (`worker_hostel`): check if `handoff.md` is complete and integrate its changes.
   - Timetable Substitution (`worker_timetable`): check if `handoff.md` is complete and integrate.
   - Library (`worker_library`): check progress and integrate.
   - Diary/Appointments (`worker_diary_appts`): check if `handoff.md` is complete and integrate.
3. CRITICAL COMPILE ERROR to address in all backend services:
   - The baseline test verification reported a build failure:
     `Error: A "use server" file can only export async functions, found object.` in `/library/history`.
   - Next.js Server Actions files (marked with `'use server'` at the top) CANNOT export objects like `export const LibraryService = { ... }`. They must export individual async functions (e.g. `export async function getLibraryStudents() { ... }`).
   - Check all new/updated services (`hostel.service.ts`, `library.service.ts`, `timetable.service.ts`, `diary.service.ts`, `appointments.service.ts`, `gradebook.service.ts`) and make sure they export individual async functions if they have `'use server'` at the top, or remove `'use server'` if they are only imported in Server Components.
4. Clean up legacy functions for these modules in `apps/web/src/lib/actions/scaffolding-bridge.ts`.
5. Once E2E Testing Track publishes `TEST_READY.md` at root, run all E2E tests (make sure to seed the database first using `pnpm --filter @school-sis/web db:push` and `pnpm --filter @school-sis/web db:seed`) and verify they pass.
6. Report progress and completion back to parent conversation ID: 641d0ba7-2e9e-4d26-83de-a6076b38cbd7.

You are a teamwork_preview_self sub-orchestrator. You must delegate coding and verification tasks to subagents. Do not modify source code directly.
