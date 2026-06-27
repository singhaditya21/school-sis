# Scope: E2E Testing for Migrated Modules (Gen 4)

## Architecture
- **E2E Testing Framework**: Playwright (configured in `apps/web/playwright.config.ts`)
- **Target Modules**:
  1. Gradebook: Route `/teacher/gradebook` (inputs, CBCS matrix, analytics, automated grading curve)
  2. Hostel Fees: Route `/hostel/fees` (fees table, status badges, filters)
  3. Timetable Substitution: Route `/timetable/substitution` (substitution requests, teacher assignments)
  4. Library Management: Route `/library/issue` & `/library/history` (issue books, search, borrow history)
  5. Diary/Appointments: Routes `/diary` & `/appointments` (diary entries, parent-teacher appointments)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Plan & Infra Setup | Verify/Document 4-tier E2E plan in TEST_INFRA.md | None | DONE |
| M2 | Baseline Compilation Fixes | Resolve the Next.js compilation error for `/library/history` page | None | DONE |
| M3 | Database Setup & Baseline Verify | Push & Seed database, run baseline E2E tests, ensure dev server starts | M2 | DONE |
| M4 | Implement E2E Tests | Implement/Extend Playwright tests for all 5 migrated modules | M3 | DONE |
| M5 | Verification & Run | Verify all Playwright E2E tests pass cleanly | M4 | DONE |
| M6 | Publish TEST_READY.md | Write test readiness file and report to parent | M5 | DONE |
