# Handoff Report — Test Verification Results

## 1. Observation

### Unit Tests (Jest)
- **Command Run**: `pnpm --filter @school-sis/web test`
- **Output**:
```
Test Suites: 6 passed, 6 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        0.462 s, estimated 1 s
Ran all test suites.
```
- **Conclusion**: 100% of the unit tests passed.

---

### E2E Tests (Playwright - Parallel Run)
- **Command Run**: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
- **Output**:
```
Running 173 tests using 4 workers
...
  16 failed
    [chromium] › e2e/inventory-core.spec.ts:260:9 › Inventory Module Core E2E Tests › E2E-IN-203: Asset condition tag fallback check 
    [chromium] › e2e/migrated-modules.spec.ts:124:9 › Hostel E2E Tests - Tier 1 › E2E-HS-102: Filter hostel fees by status paid 
    [chromium] › e2e/migrated-modules.spec.ts:169:9 › Timetable Substitution E2E Tests - Tier 1 › E2E-TT-102: Absent teachers today list populated 
    [chromium] › e2e/migrated-modules.spec.ts:382:9 › Timetable Substitution E2E Tests - Tier 2 › E2E-TT-202: Dialog missing subject validation holds submission 
    [chromium] › e2e/migrated-modules.spec.ts:391:9 › Timetable Substitution E2E Tests - Tier 2 › E2E-TT-203: Substitution access unauthorized when logged out 
    [chromium] › e2e/migrated-modules.spec.ts:398:9 › Timetable Substitution E2E Tests - Tier 2 › E2E-TT-204: Substitution dashboard rejects Parent role 
    [chromium] › e2e/migrated-modules.spec.ts:404:9 › Timetable Substitution E2E Tests - Tier 2 › E2E-TT-205: Substitution details handles invalid id parameter 
    [chromium] › e2e/migrated-modules.spec.ts:412:9 › Library E2E Tests - Tier 2 › E2E-LB-201: Issue book validator blocks empty book selection 
    [chromium] › e2e/migrated-modules.spec.ts:421:9 › Library E2E Tests - Tier 2 › E2E-LB-202: Issue book validator blocks empty student selection 
    [chromium] › e2e/migrated-modules.spec.ts:429:9 › Library E2E Tests - Tier 2 › E2E-LB-203: Catalog Search empty result handles gracefully 
    [chromium] › e2e/migrated-modules.spec.ts:437:9 › Library E2E Tests - Tier 2 › E2E-LB-204: Library issue page redirects when logged out 
    [chromium] › e2e/migrated-modules.spec.ts:444:9 › Library E2E Tests - Tier 2 › E2E-LB-205: Library issue page rejects Parent role access 
    [chromium] › e2e/migrated-modules.spec.ts:452:9 › Diary & Appointments E2E Tests - Tier 2 › E2E-DA-201: Diary view redirects when logged out 
    [chromium] › e2e/migrated-modules.spec.ts:459:9 › Diary & Appointments E2E Tests - Tier 2 › E2E-DA-202: Appointments view redirects when logged out 
    [chromium] › e2e/migrated-modules.spec.ts:466:9 › Diary & Appointments E2E Tests - Tier 2 › E2E-DA-203: Parent portal diary does not expose write options 
    [chromium] › e2e/transport-core.spec.ts:260:9 › Transport Module Core E2E Tests › E2E-COM-302: Student Transport route assignment integrates transport fee 
  45 skipped
  112 passed (3.0m)
```
- **Verbatim Error Excerpts**:
  1. `E2E-IN-203`:
     ```
     Error: expect(locator).toBeVisible() failed
     Locator: locator('[data-testid="asset-condition-9d91adf6-a010-414b-bfb6-b09e010414b2"]')
     Expected: visible
     ```
  2. `E2E-HS-102`:
     ```
     Error: expect(locator).toHaveCount(expected) failed
     Locator:  locator('table tbody tr')
     Expected: 2
     Received: 3
     ```
  3. `E2E-TT-202`:
     ```
     TimeoutError: page.waitForURL: Timeout 45000ms exceeded.
     waiting for navigation to "/dashboard" until "load"
     ```
  4. Connection Refused errors for remaining 11 failures:
     ```
     Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/login
     ```

---

### E2E Tests (Playwright - Sequential Run)
- **Command Run**: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e --workers=1`
- **Output**:
```
Running 173 tests using 1 worker
...
  45 skipped
  128 passed (1.6m)
```
- **Conclusion**: 100% of the non-skipped active E2E tests pass when run sequentially.

---

## 2. Logic Chain

1. **Observation 1**: Under parallel execution (4 workers), 16 tests failed. The failure modes include:
   - Elements/records not found (`E2E-IN-203`, `E2E-HS-102`, `E2E-TT-102`, `E2E-COM-302`).
   - Web Server timeouts (`E2E-TT-202` page navigation timeout of 45s).
   - Network connection refused errors (`ERR_CONNECTION_REFUSED`) for all tests scheduled thereafter, indicating the backend dev server had crashed or was stopped by Playwright.
2. **Observation 2**: When run individually (e.g., `-g "E2E-IN-203"`, `-g "E2E-HS-102"`, `-g "E2E-TT-102"`, `-g "E2E-COM-302"`), each previously failed test passes 100% successfully.
3. **Observation 3**: When run sequentially with `--workers=1`, all 128 active test cases pass 100% successfully (0 failures, 45 skipped).
4. **Inference**: The E2E tests are writing to, modifying, and cleaning up a single shared database instance concurrently. They share identical hardcoded test records (e.g. `TEST_ASSET_ID_2`, test student `Aarav Sharma`, etc.) and delete/reset them in `beforeEach` hooks.
5. **Conclusion**: The E2E test suite has **parallel execution safety issues (race conditions)**. Multiple workers concurrently clear and re-insert the same database IDs, which invalidates assertions in running tests and starves/overwhelms database connections, ultimately causing Next.js server timeouts and crashes.

---

## 3. Caveats

- We assumed that the local PostgreSQL instance at `postgresql://adityasingh@localhost:5432/school_sis` is the single source of truth for the Next.js server and the database pool utilities within E2E tests.
- We did not isolate database schemas per worker, which is a common pattern to resolve parallel database test conflicts.

---

## 4. Conclusion

- **Unit tests**: 100% healthy (47/47 passed).
- **E2E tests**: 100% healthy **only when run sequentially** (128/128 active tests passed). Under parallel execution, they fail due to database state conflicts and connection overload.
- **Actionable recommendation**: Update `playwright.config.ts` or the test script commands to enforce `workers: 1` locally, OR refactor the tests to use unique/randomized mock IDs per test run rather than hardcoded global IDs.

---

## 5. Verification Method

To verify the test suite status:
1. **Unit Tests**:
   ```bash
   pnpm --filter @school-sis/web test
   ```
2. **E2E Tests (Sequential - Safe)**:
   ```bash
   LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e --workers=1
   ```
3. **E2E Tests (Parallel - Flaky/Unsafe)**:
   ```bash
   LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e
   ```
