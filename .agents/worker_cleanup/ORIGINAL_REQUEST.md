## 2026-06-27T15:12:00Z
You are the Scaffolding Bridge Cleanup Worker.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_cleanup
Your task is:
1. In `apps/web/src/lib/actions/scaffolding-bridge.ts`, remove the legacy scaffolded functions for:
   - Hostel Fees (`getHostelFees`)
   - Library Students (`getLibraryStudents`)
   - Timetable Substitution (`getSubstitutionTeachers` and `getSubstitutionRequests`)
   - Diary (`getDiaryEntries`)
   - Appointments (`getAppointments`)
   - Gradebook (`getGradebookData`)
   Ensure that `getTenantId` and `getMessageTemplates` (which is still used by other parts of the system) are NOT removed and remain untouched.
2. Run build and compilation checks (`pnpm --filter @school-sis/web build` or `pnpm test`) to verify that the project still compiles and builds cleanly without any errors.
3. Write a handoff report in your folder describing the cleaned file and build validation.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
