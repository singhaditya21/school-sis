# Handoff Report - Gradebook Module Migration Completion

## 1. Observation
- The previous agent created the service at `apps/web/src/lib/services/gradebook/gradebook.service.ts` and refactored the UI page at `apps/web/src/app/teacher/gradebook/page.tsx` (which imports `getAdvancedGradebook` from `apps/web/src/lib/actions/exams.ts`).
- Inspection of `apps/web/src/lib/services/gradebook/gradebook.service.ts` revealed that:
  1. The file was missing `'use server';` directive at the top.
  2. The students query (lines 20-27) did not filter by `g.tenant_id = $1` (tenant isolation on grades):
     ```typescript
     WHERE s.tenant_id = $1 AND g.id = $2 AND s.status = 'ACTIVE'
     ```
- Inspection of `apps/web/src/lib/actions/exams.ts` (specifically used by the UI page) revealed several critical tenant isolation leaks:
  1. In `getAdvancedGradebook`: Students and schedules were fetched using only `grade_id` or `subject_id` without filtering by `tenantId`.
  2. In `getExamSchedules`: The `exam_schedules` table was joined and filtered on `exam_id` but not tenant ID.
  3. In `getExamResults`: Query on `student_results` lacked the `tenantId` parameter.
  4. In `addExamSchedule`: The API accepted `examId`, `gradeId`, and `subjectId` parameters but did not check their tenant ownership prior to insertion.
  5. In `saveMarks`: DB updates and inserts to `student_results` did not verify `examScheduleId` or `existing` result rows against `tenantId`.

- Running `pnpm --filter @school-sis/web build` compiles the Next.js application successfully:
  ```
  ✓ Compiled successfully in 16.1s
  ```
- Running `pnpm test` in the workspace root runs 6 test suites, and all of them pass:
  ```
  PASS src/__tests__/gradebook-service.test.ts
  PASS src/__tests__/library-service.test.ts
  PASS src/__tests__/hostel-service.test.ts
  PASS src/__tests__/fee-service.test.ts
  PASS src/__tests__/auth-validations.test.ts
  PASS src/__tests__/diary-appointments-services.test.ts
  Test Suites: 6 passed, 6 total
  Tests:       47 passed, 47 total
  ```

## 2. Logic Chain
1. To ensure `@school-sis/web` can safely import and execute `getGradebookData` from either Server Components or Client-side/Action files, the `'use server';` directive was added to the top of `gradebook.service.ts`.
2. To prevent cross-tenant queries, the `getGradebookData` students query was updated to check both `s.tenant_id = $1` and `g.tenant_id = $1`.
3. To fully enforce the tenant isolation policy on all Gradebook-related operations, the queries inside `apps/web/src/lib/actions/exams.ts` (e.g. `getAdvancedGradebook`, `getExamSchedules`, `getExamResults`, `addExamSchedule`, and `saveMarks`) were updated to explicitly include checks on the authenticated user's `tenantId`.
4. Unit tests were added in `apps/web/src/__tests__/gradebook-service.test.ts` to assert that permission check works, query inputs correctly use the tenant ID, and unauthorized attempts are rejected.

## 3. Caveats
- No caveats.

## 4. Conclusion
The Gradebook module migration has been successfully verified, secured against cross-tenant attacks, and completed. Both compilation checks (`pnpm build`) and unit tests (`pnpm test`) pass cleanly.

## 5. Verification Method
1. Inspect the following files to verify parameterized query structure and `tenantId` enforcement:
   - `apps/web/src/lib/services/gradebook/gradebook.service.ts`
   - `apps/web/src/lib/actions/exams.ts`
2. Run Jest unit tests from root:
   ```bash
   pnpm test
   ```
3. Run Next.js production build:
   ```bash
   pnpm --filter @school-sis/web build
   ```
