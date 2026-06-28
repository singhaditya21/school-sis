# Handoff Report - Timetable Module E2E Tests Implementation (Milestone 4)

## 1. Observation
- E2E tests command executed successfully:
  `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/timetable-core.spec.ts --workers=1`
- Verbatim output showed:
  ```
  Running 13 tests using 1 worker
  ...
  13 passed (52.4s)
  ```
- Stale server processes on port `3000` were identified using `lsof -i :3000` and terminated to prevent stale routing.
- Next.js dynamic routing warning resolved:
  `Route "/timetable/[sectionId]" used params.sectionId. params is a Promise and must be unwrapped with await...`
  Awaited the `params` object in dynamic routes (`/timetable/[sectionId]` and `/timetable/substitution/detail/[id]`).

## 2. Logic Chain
- To implement all 13 E2E test scenarios, the underlying UI and backend forms had to be fully functional.
- Static layout placeholders in `/timetable/new` and `/timetable/substitution` were replaced with fully interactive and testable forms linked to server actions in `src/lib/actions/timetable.ts`.
- Added actions `getTeachersForTimetable` and `getSubjectsForTimetable` in `src/lib/actions/timetable.ts` to supply dynamic data to the period assignment form.
- Resolved double-booking conflict warnings by surfacing details array from the `checkConflicts` utility onto the UI alert banner (`[data-testid="error-message"]`).
- Implemented `/timetable/bulk` and integrated it with `bulkCreateEntries` server action to support bulk schedule uploads, rendering conflict lists, and allowing the test to verify and skip conflicts.
- Integrated substitutions into `/teacher/schedule` page by querying the approved `substitution_requests` table for the logged-in teacher and the current date.
- Formulated `apps/web/e2e/timetable-core.spec.ts` matching the 13 required test specifications using Playwright.
- Executed E2E tests against a fresh instance of the server and verified that all 13 test scenarios pass cleanly.

## 3. Caveats
- No caveats. The database tables are correctly isolated per tenant using the test suite's `TENANT_ID` (`0c413c23-6f0f-40ab-bd41-73e6e996ff35`).

## 4. Conclusion
- Milestone 4 is fully completed. All 13 E2E test cases (**E2E-TT-101** through **E2E-WRK-405**) are successfully implemented, compile-clean, and passing.

## 5. Verification Method
- Execute the Playwright E2E command in the root folder:
  `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/timetable-core.spec.ts --workers=1`
- Inspect files:
  - Tests: `apps/web/e2e/timetable-core.spec.ts`
  - Routes: `apps/web/src/app/(admin)/timetable/[sectionId]/page.tsx`, `apps/web/src/app/(admin)/timetable/bulk/page.tsx`, `apps/web/src/app/(admin)/timetable/substitution/detail/[id]/page.tsx`
  - Components: `apps/web/src/app/(admin)/timetable/new/page.tsx`, `apps/web/src/app/(admin)/timetable/substitution/page.tsx`
  - Actions: `apps/web/src/lib/actions/timetable.ts`
