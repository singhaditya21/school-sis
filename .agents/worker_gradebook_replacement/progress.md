# Progress

- Last visited: 2026-06-27T15:10:45Z
- Updated `apps/web/src/lib/services/gradebook/gradebook.service.ts` to add `'use server';` and verify/strengthen tenant isolation on grade selection.
- Found and fixed critical tenant isolation leaks in `apps/web/src/lib/actions/exams.ts` (specifically `getAdvancedGradebook`, `getExamSchedules`, `getExamResults`, `addExamSchedule`, and `saveMarks`).
- Created unit tests `apps/web/src/__tests__/gradebook-service.test.ts` to test Gradebook service behavior and verified that all Jest tests pass successfully.
- Running Next.js build check for `@school-sis/web` in the background.
