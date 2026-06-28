## 2026-06-28T12:22:23Z
You are a worker subagent. Your working directory is `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_m2`.
Task:
Coordinate and implement the 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) for the School SIS web application to move them from scaffolding to full comprehensive production features.

Key Requirements:
1. Full Comprehensive Implementation:
   - Implement the Drizzle schemas for Hostel, Transport, Timetable, Library, Inventory. Avoid raw database creation bypassing Drizzle.
   - Synchronize database schemas directly by executing `npx drizzle-kit push` (or `pnpm db:push`) with `DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis"`.
   - Implement all backend services (in `apps/web/src/lib/services/`) and wire the frontend pages (in `apps/web/src/app/(admin)/[module]/...`) using live Drizzle ORM server actions fetching directly from the database instead of hardcoded mock arrays/useState data.
   - Ensure the service files export the required interface contracts from `PROJECT.md` exactly, using Drizzle ORM.
     Required contracts:
     - Hostel: `getHostelOverview(tenantId: string)`, `getHostelFees(tenantId: string, filters: { status?: string, feeType?: string })`, `sendPaymentReminder(tenantId: string, feeId: string)`
     - Transport: `getRoutes(tenantId: string)`, `createRoute(tenantId: string, data: any)`, `getGPSPing(tenantId: string, vehicleId: string)`
     - Timetable: `getTimetableGrid(tenantId: string, sectionId: string)`, `createTimetableEntry(tenantId: string, data: any)`, `getSubstitutions(tenantId: string)`, `createSubstitutionRequest(tenantId: string, data: any)`
     - Library: `getBooks(tenantId: string)`, `issueBook(tenantId: string, data: { bookId: string, studentId: string, isbnOrBarcode?: string })`, `getBorrowHistory(tenantId: string)`
     - Inventory: `getAssets(tenantId: string)`, `getConsumables(tenantId: string)`, `getStockAlerts(tenantId: string)`
   - Note: For backward compatibility with existing Jest tests, please also keep and implement these functions in the services:
     - `getHostelFees` (without tenantId parameter, which gets tenantId via requireAuth) in `hostel.service.ts`
     - `getLibraryStudents` and `getLibraryHistory` in `library.service.ts`
     - `getSubstitutionTeachers` and `getSubstitutionRequests` in `timetable.service.ts`

2. Specific Logic Features:
   - Timetable module must contain conflict-resolution logic in `createTimetableEntry` to prevent assigning the same teacher to two different classes/periods/days simultaneously. Also check room collisions and section collisions.
   - Library module must contain logic in `issueBook` designed to process barcodes or ISBN numbers (validate ISBN-10 or ISBN-13 checksum formats, and if `isbnOrBarcode` is provided, look up the book by its `isbn` in the database).
   - Transport module should implement routing mapping/GPS coordination logic. In `getGPSPing`, query the `live_gps_pings` table, and if none exist, return/generate a mock coordinate or simulate movement along a path when called repeatedly.

3. DB Seed & Setup:
   - Prepare the database by running `npx tsx scripts/run-e2e-sql.ts` (or executing the SQL statements inside `insert_e2e_users.sql` against the database) to populate the necessary E2E test data.

4. E2E Verification:
   - Run Jest tests using `pnpm test` (or `npx jest`) to make sure all unit tests pass.
   - Run Playwright E2E tests:
     `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
     and make sure they pass 100%.

5. Handoff:
   - Write your findings, the files updated, database sync commands, and verification results to a handoff file at `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_m2/handoff.md`.
   - Send a message back to the parent (sub_orch_impl) with the absolute path to your handoff file.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
