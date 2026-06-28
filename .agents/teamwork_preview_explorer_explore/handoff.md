# Handoff Report

## 1. Observation
The codebase of `apps/web` contains the following resources for the 5 Core Operations modules:
- Next.js Page Routes:
  - Hostel: `apps/web/src/app/(admin)/hostel/page.tsx` and `fees/page.tsx`
  - Transport: `apps/web/src/app/(admin)/transport/page.tsx`, `new/page.tsx` and `(parent)/my-transport/page.tsx`
  - Timetable: `apps/web/src/app/(admin)/timetable/page.tsx`, `grid/page.tsx`, `new/page.tsx` and `substitution/page.tsx`
  - Library: `apps/web/src/app/(admin)/library/page.tsx`, `history/page.tsx` and `issue/page.tsx`
  - Inventory: `apps/web/src/app/(admin)/inventory/page.tsx` and `alerts/page.tsx`
- Database Schema files under `apps/web/src/lib/db/schema/`:
  - `hostel.ts` defining tables: `hostels`, `hostelRooms`, `hostelAllocations`, `messMenus`.
  - `transport.ts` defining tables: `vehicles`, `routes`, `stops`, `studentTransport`, `vehicleMaintenanceLogs`, `driverBackgroundChecks`, `liveGpsPings`.
  - `timetable.ts` defining tables: `periods`, `timetableEntries`, `substitutions`.
  - `library.ts` defining tables: `books`, `bookIssues`, `bookReservations`.
  - `inventory.ts` defining tables: `assets`, `consumables`, `stockAlerts`.
- Authentication flow `/login` page calls `loginActionV2(formData)` from `apps/web/src/lib/actions/auth.ts` which performs rate-limiting, bcrypt comparison of credentials, tenant mapping, and redirects.
- E2E Playwright helpers: `loginAsTeacher`, `loginAsAdmin`, `loginAsParent` and `runQuery` direct SQL executing utility are defined on lines 5-46 of `apps/web/e2e/migrated-modules.spec.ts`:
  ```typescript
  async function loginAsTeacher(page: Page) {
      await page.goto('/login');
      await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
      await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
      await page.fill('[data-testid="password-input"]', 'teacher123');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');
  }
  ```

## 2. Logic Chain
1. Examining the DB schema files under `src/lib/db/schema` verified that all 5 modules are mapped to PostgreSQL tables via Drizzle ORM.
2. Exploring actions under `src/lib/actions/` and `src/lib/services/` identified server-side functions (e.g. `allocateStudent`, `getRouteDetail`, `checkConflicts`, `issueBook`, `restockConsumable`) that fetch and mutate module state.
3. Reading `apps/web/e2e/migrated-modules.spec.ts` showed how the test suite runs direct SQL queries via pg Pool `runQuery` to fetch dynamic parameters (e.g. subject UUID, student UUID) and uses Playwright `expect` calls on visual labels/elements.
4. Synthesizing these details enabled drafting 60 precise E2E scenarios referencing realistic selectors (input fields, dropdown elements, table row filters) and corresponding database verification checks.

## 3. Caveats
- Some page routes (like `/transport/new` and `/timetable/new`) display layout templates without bound submit handlers, which has been highlighted in the report.
- The investigation was purely read-only; no code modifications were applied.

## 4. Conclusion
The codebase and schema mapping are complete. A set of 60 test scenarios has been successfully designed and documented in `/Users/adityasingh/PersonalWork/school-sis/.agents/teamwork_preview_explorer_explore/analysis.md` covering Happy Paths, Boundary Cases, Cross-Feature Integrations, and Real-world Workload workflows.

## 5. Verification Method
- Open and inspect the generated report: `/Users/adityasingh/PersonalWork/school-sis/.agents/teamwork_preview_explorer_explore/analysis.md`
- Verify Playwright settings and execute existing test suites using:
  ```bash
  npx playwright test apps/web/e2e/migrated-modules.spec.ts
  ```
