# School SIS Codebase Investigation Report

## Executive Summary
This report summarizes the investigation of the School SIS codebase to prepare for implementing the 5 remaining Core Operations modules (**Hostel, Transport, Timetable, Library, Inventory**). The project is structured as a pnpm monorepo using Turborepo. Core app logic resides in `/apps/web` where frontend pages (React server/client components) consume data from database queries. While Drizzle schemas are declared, several services and E2E tests rely on raw SQL queries targeting custom tables generated via `insert_e2e_users.sql` that are not yet fully integrated into Drizzle.

---

## 1. Drizzle ORM Configuration & Existing Schemas

### Drizzle Configuration
Drizzle is configured in `/apps/web/drizzle.config.ts`:
- **Schema entrypoint**: `./src/lib/db/schema/index.ts`
- **Output directory**: `./drizzle`
- **Dialect**: `postgresql`
- **Credentials**: Pulls from `process.env.DIRECT_URL` falling back to `process.env.DATABASE_URL!`.

Database connectivity is managed in `/apps/web/src/lib/db/index.ts`:
- Uses the native `pg.Pool` to construct connections.
- Wraps the pool with `drizzle(pool, { schema })` as `db`.
- Provides a `withTenant<T>(tenantId, fn)` helper to execute scoped raw queries within a transaction block enforcing row-level tenant isolation using `SELECT set_config('app.current_tenant', $1, true)`.

### Existing Schema Definitions
The schemas for the 5 target modules are defined under `/apps/web/src/lib/db/schema/`:

1. **Hostel** (`hostel.ts`)
   - **Enums**: `hostel_type` (`BOYS`, `GIRLS`, `CO_ED`), `room_type` (`SINGLE`, `DOUBLE`, `TRIPLE`, `DORMITORY`), `room_status` (`AVAILABLE`, `FULL`, `MAINTENANCE`), `allocation_status` (`ACTIVE`, `VACATED`, `PENDING`).
   - **Tables**:
     - `hostels`: `id`, `tenantId`, `name`, `type`, `wardenId`, `totalRooms`, `totalBeds`, `occupiedBeds`, `address`, `phone`, `isActive`.
     - `hostelRooms`: `id`, `tenantId`, `hostelId`, `roomNumber`, `floor`, `type`, `totalBeds`, `occupiedBeds`, `amenities` (JSONB), `status`.
     - `hostelAllocations`: `id`, `tenantId`, `studentId`, `hostelId`, `roomId`, `bedNumber`, `allocatedFrom`, `allocatedTo`, `status`.
     - `messMenus`: `id`, `tenantId`, `hostelId`, `day`, `breakfast`, `lunch`, `snacks`, `dinner`.

2. **Transport** (`transport.ts`)
   - **Tables**:
     - `vehicles`: `id`, `tenantId`, `vehicleNumber`, `type`, `capacity`, `driverName`, `driverPhone`, `driverLicense`, `conductorName`, `conductorPhone`, `insuranceExpiry`, `fitnessExpiry`, `gpsDeviceId`.
     - `routes`: `id`, `tenantId`, `vehicleId`, `name`, `description`, `morningDepartureTime`, `afternoonDepartureTime`, `monthlyFee` (numeric).
     - `stops`: `id`, `routeId`, `name`, `address`, `latitude`, `longitude`, `pickupTime`, `dropTime`, `displayOrder`.
     - `studentTransport` (assignments): `id`, `tenantId`, `studentId`, `routeId`, `stopId`, `startDate`, `endDate`.
     - `vehicleMaintenanceLogs`: `id`, `tenantId`, `vehicleId`, `serviceDate`, `serviceType`, `description`, `cost`, `performedBy`, `nextDueDate`.
     - `driverBackgroundChecks`: `id`, `tenantId`, `vehicleId`, `driverName`, `licenseNumber`, `checkDate`, `agencyName`, `status` (`Passed`, `Pending`, `Failed`), `clearanceExpiry`, `notes`.
     - `liveGpsPings`: `id`, `tenantId`, `vehicleId`, `latitude`, `longitude`, `speedKmh`, `pingTime`.

3. **Timetable** (`timetable.ts`)
   - **Enums**: `day_of_week` (`MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`).
   - **Tables**:
     - `periods`: `id`, `tenantId`, `name`, `startTime`, `endTime`, `displayOrder`, `isBreak`.
     - `timetableEntries`: `id`, `tenantId`, `sectionId`, `periodId`, `subjectId`, `teacherId`, `dayOfWeek`, `roomNumber`.
     - `substitutions`: `id`, `tenantId`, `timetableEntryId`, `originalTeacherId`, `substituteTeacherId`, `date`, `reason`.

4. **Library** (`library.ts`)
   - **Enums**: `book_category` (`TEXTBOOK`, `REFERENCE`, `FICTION`, etc.), `issue_status` (`ISSUED`, `RETURNED`, `OVERDUE`, `LOST`), `reservation_status` (`ACTIVE`, `FULFILLED`, `CANCELLED`, `EXPIRED`).
   - **Tables**:
     - `books`: `id`, `tenantId`, `title`, `author`, `isbn`, `publisher`, `edition`, `year`, `category`, `subject`, `language`, `location`, `totalCopies`, `availableCopies`, `price`, `description`, `coverUrl`, `isActive`.
     - `bookIssues`: `id`, `tenantId`, `bookId`, `issuedToUserId`, `issuedToStudentId`, `issueDate`, `dueDate`, `returnDate`, `status`, `fineAmount`, `fineReason`, `isFinePaid`, `issuedBy`, `returnedTo`, `remarks`.
     - `bookReservations`: `id`, `tenantId`, `bookId`, `userId`, `reservedAt`, `expiresAt`, `status`.

5. **Inventory** (`inventory.ts`)
   - **Enums**: `asset_category` (`FURNITURE`, `IT_EQUIPMENT`, etc.), `asset_condition` (`EXCELLENT`, `GOOD`, etc.), `consumable_category`, `stock_alert_type`, `alert_severity`.
   - **Tables**:
     - `assets`: `id`, `tenantId`, `name`, `category`, `serialNumber`, `purchaseDate`, `purchasePrice`, `vendor`, `location`, `assignedTo`, `condition`, `lastMaintenanceDate`, `warrantyExpiry`, `notes`.
     - `consumables`: `id`, `tenantId`, `name`, `category`, `unit`, `currentStock`, `minimumStock`, `reorderLevel`, `unitPrice`, `lastRestockDate`, `supplier`.
     - `stockAlerts`: `id`, `tenantId`, `itemId`, `itemType` (`ASSET` or `CONSUMABLE`), `alertType`, `severity`, `message`, `isResolved`, `resolvedAt`.

### Key Architectural Discrepancy
Several database tables queried by the frontend pages and Server Actions are **not declared in Drizzle ORM schemas**. Instead, they are created dynamically during E2E test setup via `/insert_e2e_users.sql`:
- `hostel_fees`: Queried by `/hostel/fees` page and mapped in `hostel.service.ts` using raw SQL.
- `substitution_requests`: Queried by `/timetable/substitution` page and mapped in `timetable.ts` actions and `timetable.service.ts` using raw SQL.
- `diary_entries` & `appointments`: Queried by diary & appointments pages using raw SQL.

---

## 2. Scaffolding & Mock UI Analysis

All UI files reside in `/apps/web/src/app/(admin)/[module]`:

1. **Hostel**
   - `/hostel/page.tsx`: Overview layout showing cards with total hostels, total beds, occupied/available count, and active allocations table. Imports data from `@/lib/actions/hostel`.
   - `/hostel/fees/page.tsx`: Interactive dashboard allowing filtering by status and fee type, sending payment reminders, and tracking collection metrics. Imports data from `@/lib/services/hostel/hostel.service`.

2. **Transport**
   - `/transport/page.tsx`: Lists configured transport routes as cards (stops, student count, monthly fees, departure times). Imports data from `@/lib/actions/transport`.
   - `/transport/new/page.tsx`: Scaffolding page for creating routes.

3. **Timetable**
   - `/timetable/page.tsx`: Scaffolding landing.
   - `/timetable/grid/page.tsx`: Timetable slot grid by class/section.
   - `/timetable/new/page.tsx`: UI template to add class periods.
   - `/timetable/substitution/page.tsx`: Dialog-based interface for listing absent teachers, generating substitute recommendations, and requesting coverage. Imports data from `@/lib/services/timetable/timetable.service` and `@/lib/actions/timetable`.

4. **Library**
   - `/library/page.tsx`: Book catalog overview detailing titles, availability, and rack locations. Imports data from `@/lib/actions/library`.
   - `/library/issue/page.tsx`: Tabbed layout managing book checkout constraints (14-day rule, select student validation) and returns logic. Imports data from `@/lib/actions/library` and `@/lib/services/library/library.service`.
   - `/library/history/page.tsx`: Lists historic borrow logs, overdue counts, and outstanding fines. Imports data from `@/lib/services/library/library.service`.

5. **Inventory**
   - `/inventory/page.tsx`: Consolidated tables tracking physical assets (location, warranty) and stock levels of school consumables. Imports data from `@/lib/actions/inventory`.
   - `/inventory/alerts/page.tsx`: Severity-badge highlighted list (`CRITICAL`, `WARNING`, `INFO`) showing out-of-stock items and reordering suggestions. Queries table `stock_alerts` directly via `pool.query`.

---

## 3. Backend Services & Actions Structure

Backend operations are divided between two paradigms:
- **Server Actions** (`/apps/web/src/lib/actions/*.ts`): Execute raw SQL using `pool.query` (pg client connection) or Drizzle query builder (`db.select()`). They enforce access control via `requireAuth('module:permission')`.
- **Services** (`/apps/web/src/lib/services/[module]/[module].service.ts`): Re-engineered modules that are meant to replace the legacy scaffolding bridge. They query the DB using `pool.query` or `db.execute(sql`...`)` and are consumed directly by newer server components.

### Reference Implementations
- **Gradebook Service** (`/apps/web/src/lib/services/gradebook/gradebook.service.ts`): Uses `pool.query` to pull classes and exams matching the authorized `tenantId` (gated via `requireAuth('gradebook:read')`).
- **Library Service** (`/apps/web/src/lib/services/library/library.service.ts`): Uses `pool.query` with `requireAuth('library:read')` to query student auto-completes and borrowing history logs.

### Issues / Bugs Discovered:
- **Mismatched Fields in Actions**: E.g., `getMessMenu` in `/apps/web/src/lib/actions/hostel.ts` queries fields `meal_type` and `items`, but Drizzle schema/migration defines columns `breakfast`, `lunch`, `snacks`, `dinner`. This code path is currently unconsumed by the UI but will fail if executed.
- **Obsolete Service**: `apps/web/src/lib/services/inventory/inventory.service.ts` queries table `inventory_items` which is not present in Drizzle or migrations; the active UI actually consumes the actions file `apps/web/src/lib/actions/inventory.ts` which correctly references tables `assets` and `consumables`.
- **Missing Service File**: There is no `transport.service.ts` file in the services directory; the page currently relies solely on `actions/transport.ts`.

---

## 4. Database Migration Process

- Migration schema management commands are defined in `/apps/web/package.json`:
  - `pnpm db:generate` (`drizzle-kit generate`): Creates a new SQL migration file based on schema TS changes.
  - `pnpm db:migrate` (`drizzle-kit migrate`): Applies generated migrations to the remote database.
  - `pnpm db:push` (`drizzle-kit push`): Instantly updates DB schema changes on the target database, bypassing SQL generation.
  - `pnpm db:seed` (`tsx --env-file=.env scripts/seed.ts`): Populates tables with base database rows.
- The root `package.json` contains a legacy Prisma migration script alias (`"db:migrate": "cd apps/web && pnpm prisma migrate dev"`) which is outdated and unused now that the app uses Drizzle.
- The CI pipeline (`.github/workflows/ci.yml`) runs `pnpm --filter web run migrate` on PRs and pushes to `main` to sync database schemas.

---

## 5. Build and Test Commands

### Test Execution
- **Unit/Integration Tests**: Run using `pnpm run test` (which triggers Turborepo running `jest` in `@school-sis/web`). There are **6 test suites** containing **47 tests** (covering auth, gradebook, hostel, fees, library, diary-appointments), all of which pass successfully.
- **E2E Tests**: Run using Playwright:
  `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/migrated-modules.spec.ts`
  This verifies happy path, boundaries, cross-module flows, and real-world application scenarios (60 cases in total). E2E tests are located in `apps/web/e2e/`.

### Build Execution
- **Command**: `pnpm run build` (triggers `turbo run build`).
  - **`@school-sis/web`**: Builds and compiles successfully.
  - **`website`**: Currently fails build due to a missing component path import (`@/components/ui/card` in `apps/website/src/app/(public)/apply-online/apply/page.tsx`).
