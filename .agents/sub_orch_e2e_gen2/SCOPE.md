# Scope: E2E Testing for Migrated Modules

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
| M1 | Plan & Infra Setup | Formulate 4-tier E2E plan and document in TEST_INFRA.md | None | DONE |
| M2 | Verify Baseline E2E | Run existing Playwright E2E tests and verify environment is clean | M1 | IN_PROGRESS |
| M3.1 | Gradebook E2E | Implement E2E test for `/teacher/gradebook` (relative curves, inputs) | M2 | PLANNED |
| M3.2 | Hostel Fees E2E | Implement E2E test for `/hostel/fees` (status badges, filtering) | M2 | PLANNED |
| M3.3 | Timetable Sub E2E | Implement E2E test for `/timetable/substitution` (teacher list, requests) | M2 | PLANNED |
| M3.4 | Library E2E | Implement E2E test for library issue/history | M2 | PLANNED |
| M3.5 | Diary & Appointments E2E | Implement E2E test for `/diary` and `/appointments` | M2 | PLANNED |
| M4 | Verify and Run All Tests | Run the full Playwright test suite to ensure all tests pass | M3.1 - M3.5 | PLANNED |
| M5 | Publish TEST_READY.md | Synthesize test counts, command summary, and checklist in TEST_READY.md | M4 | PLANNED |
