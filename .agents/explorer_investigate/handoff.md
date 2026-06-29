# Handoff Report

## 1. Observation
The following file paths, line numbers, and verbatim code details show mismatches and bugs:

* **Tally Vouchers Route Crash**:
  * File: `apps/web/src/app/api/integrations/tally/vouchers/route.ts` (lines 30-36)
  * Verbatim Query:
    ```sql
    SELECT
        p.id, p.amount, p.method, p.paid_at, p.provider_reference,
        i.invoice_number,
        ...
    FROM payments p
    ```
  * Mismatch: `payments` table Drizzle schema in `apps/web/src/lib/db/schema/fees.ts` (lines 65-80) has NO `provider_reference` column. It has `transactionId` mapping to SQL `transaction_id`.
* **Central Policy HQ Overview Query Crash**:
  * File: `apps/web/src/lib/actions/hq.ts` (lines 15-18)
  * Verbatim Query:
    ```typescript
    const groupResult = await pool.query(
        'SELECT id, name, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM hq_groups WHERE is_active = $1 LIMIT 1',
        [true]
    );
    ```
  * Mismatch: `hq_groups` table in `apps/web/src/lib/db/schema/hq.ts` (lines 4-10) does NOT define an `updated_at` column.
* **Alumni Actions Query Crashes**:
  * File: `apps/web/src/lib/actions/alumni.ts` (line 8)
  * Verbatim Query:
    ```typescript
    let query = 'SELECT id, tenant_id AS "tenantId", name, email, phone, batch, current_company AS "currentCompany", designation, location, linked_in AS "linkedIn", is_verified AS "isVerified", created_at AS "createdAt", updated_at AS "updatedAt" FROM alumni_profiles WHERE tenant_id = $1';
    ```
  * Mismatch: `alumni_profiles` table in `apps/web/src/lib/db/schema/alumni.ts` (lines 12-27) does NOT define an `updated_at` column. Same issue exists for `alumni_events` (line 47).
* **HQ Leads Data Field Casing Mismatch**:
  * File: `apps/web/src/app/hq/leads/page.tsx` (lines 26-32) returns camelCase fields due to SQL aliasing (`contact_name AS "contactEmail"`, `school_name AS "schoolName"`).
  * Client Component: `apps/web/src/app/hq/leads/client-page.tsx` (lines 113, 117, 122, 124, 127) expects snake_case: `lead.created_at`, `lead.school_name`, `lead.contact_email`, `lead.contact_name`, `lead.student_capacity`.
* **HQ Broadcasts Data Field Casing Mismatch**:
  * File: `apps/web/src/app/hq/broadcasts/page.tsx` (line 17) runs `SELECT *` from `platform_broadcasts`.
  * Client Component: `apps/web/src/app/hq/broadcasts/client-page.tsx` (lines 27, 88, 91) accesses fields using camelCase: `b.isActive` and `b.targetTiers`.
* **HQ Treasury Column Mismatch**:
  * File: `apps/web/src/app/hq/treasury/page.tsx` (lines 15-23)
  * Verbatim Query:
    ```sql
    SELECT payment_method, SUM(amount)::int as total_volume... FROM payments GROUP BY payment_method
    ```
  * Mismatch: `payments` table schema in `fees.ts` defines the column as `method` mapping to SQL `method`. No `payment_method` column exists in the database.
* **Active Modules Serialization Mismatch**:
  * File: `apps/web/src/lib/actions/platform.ts` (line 321) writes:
    ```typescript
    payload.activeModules ? JSON.stringify(payload.activeModules) : '[]'
    ```
  * Mismatch: `activeModules` in the `companies` table schema is defined as a PG text array `text('active_modules').array()`, not JSONB.
* **Missing Drizzle Schema Entities**:
  * File: `apps/web/src/lib/services/diary/diary.service.ts` queries the `diary_entries` table.
  * File: `apps/web/src/lib/services/appointments/appointments.service.ts` queries the `appointments` table.
  * Mismatch: No `diary_entries` or `appointments` table exists in any Drizzle schema files in `apps/web/src/lib/db/schema/`.

## 2. Logic Chain
1. If a table's Drizzle schema file (e.g. `hq.ts`, `alumni.ts`, `higher_ed.ts`) does not declare a column (such as `updated_at`), then a database created from those schemas will not have that column.
2. Running raw SQL queries that reference non-existent columns (e.g. `updated_at AS "updatedAt" FROM hq_groups`) will fail at the database level with a `column does not exist` error.
3. If SQL queries return camelCase keys (via aliases), reading snake_case properties on the client side (e.g. `lead.school_name` vs `lead.schoolName`) will evaluate to `undefined`.
4. If a SQL query selects all columns (`SELECT *`) returning snake_case keys (e.g. `is_active`), reading camelCase keys in client charts/lists (e.g. `b.isActive`) will yield `undefined` values.
5. If an array field is declared as a native PG array `text[ ]` rather than a JSON column, binding a JSON string representation of an array will cause an input syntax validation exception.

## 3. Caveats
* The database was assumed to be synchronized with the active Drizzle schemas (`db/schema/*.ts`). If migrations were run out-of-band with columns like `updated_at` manually appended, the raw SQL queries might succeed but the codebase schemas remain out-of-sync.

## 4. Conclusion
The codebase scaffolding contains critical raw SQL errors, column mismatches, casing inconsistencies, and missing database schemas (especially for `/diary` / `diary_entries` and `appointments`).
To address these issues, all raw queries should be migrated to type-safe Drizzle ORM builders, which enforce structural compliance, map aliases automatically, and correctly format array inputs.

## 5. Verification Method
* Run local Jest tests: `pnpm test` (or `cd apps/web && pnpm test`) to confirm action execution.
* Inspect Drizzle ORM schemas in `apps/web/src/lib/db/schema/` to ensure query properties match the TypeScript definitions exactly.
