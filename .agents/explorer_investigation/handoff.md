# Handoff Report — explorer_investigation

## 1. Observation

Direct observations made during the investigation of `/Users/adityasingh/PersonalWork/school-sis`:

1. **Drizzle Configuration**:
   - Location: `/apps/web/drizzle.config.ts`
   - Content:
     ```typescript
     import { defineConfig } from 'drizzle-kit';
     export default defineConfig({
         schema: './src/lib/db/schema/index.ts',
         out: './drizzle',
         dialect: 'postgresql',
         dbCredentials: {
             url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
         },
         verbose: true,
         strict: true,
     });
     ```
2. **Dynamic Table Declarations**:
   - In `/insert_e2e_users.sql` (lines 2–49), tables are created raw in SQL, bypassing Drizzle schemas:
     - `substitution_requests` (lines 2-12)
     - `diary_entries` (lines 14-25)
     - `appointments` (lines 27-38)
     - `hostel_fees` (lines 40-49)
3. **Mismatched Fields in Hostel Actions**:
   - In `apps/web/src/lib/actions/hostel.ts` (lines 187-207), `getMessMenu` queries fields `meal_type` and `items`:
     ```typescript
     SELECT id, tenant_id AS "tenantId", hostel_id AS "hostelId", day, meal_type AS "mealType", items, ... FROM mess_menus
     ```
   - In `apps/web/src/lib/db/schema/hostel.ts` (lines 65-75), the `messMenus` table has breakfast, lunch, snacks, dinner columns:
     ```typescript
     export const messMenus = pgTable('mess_menus', {
         ...
         breakfast: text('breakfast'),
         lunch: text('lunch'),
         snacks: text('snacks'),
         dinner: text('dinner'),
         ...
     });
     ```
4. **Obsolete/Unused Inventory Service**:
   - `/apps/web/src/lib/services/inventory/inventory.service.ts` uses `inventory_items`:
     ```typescript
     SELECT id,name,category,quantity,unit,min_stock AS "minStock",... FROM inventory_items
     ```
   - No `inventory_items` table is defined in the Drizzle schemas under `/apps/web/src/lib/db/schema/inventory.ts`, which instead uses `assets` and `consumables` tables.
5. **Test and Build Status**:
   - Unit tests run using `pnpm run test` executing successfully:
     `Test Suites: 6 passed, 6 total. Tests: 47 passed, 47 total.`
   - Next.js build compilation for `@school-sis/web` successfully completes (`✓ Compiled successfully in 7.8s`), while the Turborepo root build `pnpm run build` fails on the `website` package due to a missing component path import:
     `Module not found: Can't resolve '@/components/ui/card' in apps/website/src/app/(public)/apply-online/apply/page.tsx`

---

## 2. Logic Chain

1. **Schema Mismatches**:
   - Because `hostel_fees` and `substitution_requests` are created directly via `/insert_e2e_users.sql` (Observation 2), Drizzle ORM does not recognize them as TypeScript schema types, leading developers to write raw PostgreSQL queries using `pool.query` in backend actions and services.
   - When migrating these modules to Drizzle schema structures, these tables must be properly defined in `/apps/web/src/lib/db/schema/hostel.ts` and `timetable.ts`.
2. **Backend Redundancy**:
   - Because the project has transitioned from Server Actions (`/apps/web/src/lib/actions/*.ts`) to Backend Services (`/apps/web/src/lib/services/**/*.service.ts`), there are active redundancies (Observation 4). E.g. `/lib/services/inventory/inventory.service.ts` is completely obsolete/unused, and instead `lib/actions/inventory.ts` is consumed.
3. **Broken Query in Action**:
   - Because `getMessMenu` in `/apps/web/src/lib/actions/hostel.ts` queries `meal_type` and `items` columns instead of `breakfast`/`lunch`/`snacks`/`dinner` (Observation 3), calling this action will crash at runtime. The front-end `/hostel` page does not currently call `getMessMenu`, so the bug was hidden.
4. **Build Failures**:
   - Although the main application `@school-sis/web` builds successfully, the `website` package in the monorepo fails to compile because of a wrong import path (Observation 5).

---

## 3. Caveats

- Playwright E2E tests target only 5 migrated modules: Gradebook, Hostel Fees, Timetable Substitution, Library, Diary & Appointments. Transport and Inventory modules are not covered by the current Playwright spec file.
- The PostgreSQL db server was assumed to be running locally during Playwright/E2E executions, as per the configurations in `TEST_READY.md`.

---

## 4. Conclusion

The School SIS core modules are partially migrated. Hostel, Timetable, Library, and Inventory have active scaffolding pages consuming backend Server Actions. However:
1. Active mismatches between the live DB tables (created by `insert_e2e_users.sql` setup script) and Drizzle TS schemas exist and must be cleaned up during full migration (specifically `hostel_fees` and `substitution_requests`).
2. Obsolete backend services (e.g. `inventory.service.ts` targeting `inventory_items` table) must be replaced or deleted.
3. The broken raw query in `getMessMenu` action must be resolved, aligning with `mess_menus` Drizzle table definitions.
4. The wrong import path in the `website` package must be corrected to achieve a clean workspace build.

---

## 5. Verification Method

- **Unit Tests**:
  `pnpm run test`
  Confirm all 47 Jest test cases pass.
- **Main App Build**:
  `pnpm --filter @school-sis/web build`
  Confirm the Next.js compile is successful.
- **E2E Tests**:
  `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/migrated-modules.spec.ts`
  Verify all Playwright scenarios pass.
