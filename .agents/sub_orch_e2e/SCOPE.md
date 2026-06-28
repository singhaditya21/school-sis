# Scope: E2E Testing of 5 Core Operations modules

## Architecture
- Testing targets: 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) in Next.js web app.
- Execution runner: Playwright, with tests located under `apps/web/e2e/`.
- Backend state control: Direct DB queries via helper to verify or mock state.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Plan & Setup | Design test cases list and write TEST_INFRA.md | none | DONE |
| 2 | Hostel E2E | Implement 12 E2E tests for Hostel (Tiers 1-4) in `apps/web/e2e/hostel-core.spec.ts` | M1 | DONE |
| 3 | Transport E2E | Implement 12 E2E tests for Transport (Tiers 1-4) in `apps/web/e2e/transport-core.spec.ts` | M2 | DONE |
| 4 | Timetable E2E | Implement 12 E2E tests for Timetable (Tiers 1-4) in `apps/web/e2e/timetable-core.spec.ts` | M3 | DONE |
| 5 | Library E2E | Implement 12 E2E tests for Library (Tiers 1-4) in `apps/web/e2e/library-core.spec.ts` | M4 | DONE |
| 6 | Inventory E2E | Implement 12 E2E tests for Inventory (Tiers 1-4) in `apps/web/e2e/inventory-core.spec.ts` | M5 | DONE |
| 7 | Verification & Ready | Run all tests and publish TEST_READY.md at project root | M6 | DONE |

## Interface Contracts
- None (E2E testing uses Playwright UI selectors and DB queries, no new backend/frontend interfaces are created).
