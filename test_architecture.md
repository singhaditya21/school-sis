# Enterprise Testing Architecture: School SIS

This document outlines the testing framework and execution pipeline designed for the School SIS platform.

## 1. Core Principles
- **Isolation:** Every test suite runs against a freshly provisioned database schema to guarantee zero state collision.
- **Realism:** Tests run against actual PostgreSQL databases and Next.js servers, not mock databases.
- **Cost-Efficiency:** Third-party networks (Stripe, Twilio) are intercepted at the network layer to prevent real charges and flakiness.
- **Velocity:** The CI pipeline uses matrix sharding to keep execution time under 5 minutes despite hundreds of E2E tests.

## 2. The Testing Pyramid

### Phase 1: End-to-End (E2E) Integrity Layer
- **Framework:** Playwright (`@playwright/test`)
- **Coverage:** The 120+ existing E2E tests covering core flows (Admissions, Fees, Attendance, Grading).
- **Database Strategy:** 
  - `global-setup.ts`: Connects to Postgres, spins up `school_sis_test_${timestamp}`, pushes Drizzle schema, and runs `seed.ts`.
  - `playwright.config.ts`: Loads `.env.test` dynamically and starts the Next.js production build (`next start`).
  - `global-teardown.ts`: Drops the test database cleanly.

### Phase 2: Unit & Component Logic Layer
- **Framework:** Jest + React Testing Library (RTL)
- **Coverage:** Complex UI components (e.g., dynamic Metadata form builders) and isolated utility functions (e.g., GPA calculators).
- **Mocking Strategy (MSW):**
  - **Mock Service Worker (MSW)** runs at the Node.js network layer.
  - Intercepts `fetch()` calls to external APIs.
  - Allows RSCs (React Server Components) to execute their normal data-fetching logic, receiving deterministic JSON responses from MSW instead of Stripe/Twilio.

### Phase 3: Load & Scale Layer
- **Framework:** k6 or Artillery (Planned for future)
- **Coverage:** Simulates 10,000 concurrent parent logins or report card generation to ensure connection pooling (PgBouncer) holds up.

## 3. CI/CD Execution Strategy

**Platform:** GitHub Actions
**Trigger:** On Pull Request to `main` and on merge to `main`.

**Pipeline Steps:**
1. **Lint & Build:** Run `eslint`, TypeScript type checking, and `next build`.
2. **Matrix Test Execution:**
   - Use GitHub Actions `strategy.matrix` to shard Playwright tests across 4 parallel runners.
   - Run a PostgreSQL service container (`services: postgres`) on each runner.
   - Each runner executes the `global-setup.ts` to spin up its own database instance.
3. **Merge Gate:** All matrix shards must pass before the PR can be merged into `main`.
