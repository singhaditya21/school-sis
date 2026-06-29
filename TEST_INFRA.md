# E2E Test Infrastructure: School SIS

## Test Philosophy
- **Opaque-box, requirement-driven**: We test user-facing flows of the school information system without relying on or mocking internal service details, validating features directly through the UI.
- **Methodology**: Apply Category-Partition Testing, Boundary Value Analysis, and Pairwise Combinatorial Testing to thoroughly cover happy paths, boundary inputs, cross-feature operations, and real-world workloads.

## Feature Inventory
We identify critical features across the ten modules:
1. **Hostel**: Dashboard loading, active allocations table, hostel fees tracking and filtering, room allocation fee creation triggers, student vacating waitlist reactivation loop, and mess menu weekly meal scheduler.
2. **Transport**: Route listing and creation, GPS vehicle ping telemetry mapping, and transport fee generation.
3. **Timetable**: Today's substitutions list, absentee teachers today list, new substitution request dialogue, substitute collision prevention checks, and substitution dashboard updates.
4. **Library**: Catalog search by title/ISBN, student borrow/checkout/return rental life-cycles, history tracking, and checkout input validation checks.
5. **Inventory**: Asset register listings, consumable stock tracking, stock alert cards, and procurement workflows.
6. **Financial & Treasury**: Ledgers (`/treasury`) and Tally ERP/Prime integration export (`/integrations/tally`).
7. **HQ & Multi-Tenant Management**: Command center (`/hq`) and platform configurations (`/platform`).
8. **Advanced Analytics**: Analytics dashboard metrics, trends (`/analytics`), and academic calendar (`/calendar`).
9. **Student Success**: Placements (`/university`), alumni tracking (`/alumni`), and international/visa compliance (`/international`).
10. **Daily Utilities**: Document storage (`/documents`) and school diary logs (`/diary`).

| #   | Feature Module | Core UI Flows / Actions | Tier 1 (Happy) | Tier 2 (Boundary) |
| --- | -------------- | ----------------------- | :------------: | :---------------: |
| 1   | Hostel         | Dashboard, Allocations, Fees, Mess Menu, Waitlist | 5 | 5 |
| 2   | Transport      | Routes management, GPS ping, Fees | 5 | 5 |
| 3   | Timetable      | Substitutions list, request dialog, collisions | 5 | 5 |
| 4   | Library        | Catalog search, checkout/return logs, history | 5 | 5 |
| 5   | Inventory      | Assets list, Stock alerts, consumables | 5 | 5 |
| 6   | Treasury       | Dashboard, Exceptions list, Sync vouchers, mappings | 5 | 5 |
| 7   | HQ / Platform  | Command center, Fleet matrix, Onboarding form, billing | 5 | 5 |
| 8   | Analytics      | KPIs, Fee Trend, Attendance, Exam chart, calendar | 5 | 5 |
| 9   | Student Success| Placements, Alumni directory, Visa compliance, events | 5 | 5 |
| 10  | Utilities      | Document stats, registry table, School diary, entries | 5 | 5 |

## Test Architecture
- **Test Runner**: Playwright
- **Test Locations**: All E2E test spec files are located in `apps/web/e2e/`.
- **Database Query Utility**: A PG Pool `runQuery` utility or direct Drizzle operations executed inside tests to seed, verify post-action state, and clean up database tables without leaking connections.
  ```typescript
  async function runQuery(text: string, params?: any[]) {
      const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 1,
          idleTimeoutMillis: 500,
      });
      try {
          const res = await pool.query(text, params);
          return res;
      } finally {
          await pool.end();
      }
  }
  ```
- **Pass/Fail Semantics**: All E2E test commands must exit with code 0.

## Real-World Application Scenarios (Tier 4 list)
These scenarios exercise end-to-end user workflows:
1. **End-of-term grading**: Gradebook selection, relative curve calculations, and final report cards publishing.
2. **Library rental lifecycle**: Catalog search, book checkouts, history tracking, and returns.
3. **Daily school substitution**: Teacher absence check, new substitution request creation, and substitute assignment.
4. **Term-end hostel fee audit**: Filter and audit paid/outstanding hostel fees, verifying correct metrics.
5. **Parent communication loop**: Diary homework uploads and parent appointments/PTM scheduling checks.
6. **Hostel vacating & waitlist reallocation**: Vacating active student, triggering automatic next-in-line waitlist student reallocation.
7. **Mid-term financial sync**: Admin reviews payment ledger exceptions, resolves dispute, and exports updated vouchers to Tally ERP.
8. **Platform administrator onboarding loop**: Onboarding a new school, updating settings, setting custom domain mask, and impersonating the school administrator to verify initialization.
9. **Term-end academic audit**: Pulling advanced exam analytics, verifying with the academic calendar schedules, and compiling reports.
10. **Student success evaluation**: Evaluating placement metrics, tracing corresponding alumni paths, and cross-referencing visa compliance for international students.
11. **Daily class admin loop**: Teacher posts daily homework to diary, uploads supporting documents, and checks student read-status.

## Coverage Thresholds
- **Tier 1 (Happy Path)**: >=5 test cases per module, total 50.
- **Tier 2 (Boundary & Corner Cases)**: >=5 test cases per module, total 50.
- **Tier 3 (Cross-Feature Combinations)**: >=10 test cases total across all modules.
- **Tier 4 (Real-World Workloads)**: >=10 test cases total across all modules.
- **Total Suite Size**: exactly 120 test cases.

