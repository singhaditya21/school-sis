# Milestone Analysis and Fix Strategy Report

This report outlines the codebase investigation findings and provides a detailed strategy, code diffs, and architectural designs to resolve database mismatches, query issues, casing discrepancies, and scaffolding gaps.

---

## 1. Schema Analysis: `diary_entries` and `appointments`

### Observations:
In `insert_e2e_users.sql`, the tables are defined as follows:

```sql
CREATE TABLE IF NOT EXISTS diary_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title varchar(255) NOT NULL,
    content text NOT NULL,
    date varchar(10) NOT NULL,
    grade_id uuid,
    section_id uuid,
    subject_id uuid,
    teacher_id uuid,
    type varchar(50)
);

CREATE TABLE IF NOT EXISTS appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title varchar(255) NOT NULL,
    description text,
    date varchar(10) NOT NULL,
    time varchar(10) NOT NULL,
    duration integer NOT NULL,
    with_user_id uuid,
    status varchar(50) DEFAULT 'scheduled',
    type varchar(50)
);
```

### Analysis of Service Interactions:
* **`diary.service.ts`**: Queries `id`, `title`, `content`, `date`, `type` directly, joins with `grades`, `sections`, `subjects`, and `users` to resolve names. The schema in `insert_e2e_users.sql` matches the joins and selections.
* **`appointments.service.ts`**: Queries `id`, `title`, `description`, `date`, `time`, `duration`, `status`, `type` and joins with `users` on `with_user_id`. The schema in `insert_e2e_users.sql` matches.
* **`diary-appointments-services.test.ts`**: Mocks the database pool query response and asserts that queries containing `FROM diary_entries` and `FROM appointments` are called with `tenantId`.

**Conclusion**: The schema and service calls are structurally correct and aligned. No schema modifications are required for these tables.

---

## 2. Multi-Tenant Isolation Fix in `treasury.ts`

### Issue:
In `apps/web/src/lib/actions/treasury.ts`, the `getTreasurySummaryAction` aggregates overdue and outstanding invoices across **all tenants**, leaking financial information.

### Fix Strategy:
Restrict invoice aggregation using `session.tenantId`.

### Code Modification:
**Target File**: `apps/web/src/lib/actions/treasury.ts` (Lines 21-33)

**Before**:
```typescript
    // Aggregate total overdue
    const { rows: overdueQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOverdue"
        FROM invoices
        WHERE status = $1
    `, ['OVERDUE']);

    // Aggregate total outstanding
    const { rows: outstandingQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOutstanding"
        FROM invoices
        WHERE status = $1
    `, ['PENDING']);
```

**After**:
```typescript
    // Aggregate total overdue
    const { rows: overdueQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOverdue"
        FROM invoices
        WHERE status = $1 AND tenant_id = $2
    `, ['OVERDUE', session.tenantId]);

    // Aggregate total outstanding
    const { rows: outstandingQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOutstanding"
        FROM invoices
        WHERE status = $1 AND tenant_id = $2
    `, ['PENDING', session.tenantId]);
```

---

## 3. Columns Mismatch in Tally Vouchers API Route

### Issue:
In `apps/web/src/app/api/integrations/tally/vouchers/route.ts` (Line 31), the SQL query selects `p.provider_reference`. However, the `payments` table schema (both in migrations and Drizzle) contains `transaction_id`, but does NOT contain a `provider_reference` column. This query will crash with:
`column "provider_reference" does not exist`.

### Fix Strategy:
Change the selection to use `p.transaction_id AS provider_reference` or remove it (since it is not referenced in the subsequent Tally XML generation anyway).

### Code Modification:
**Target File**: `apps/web/src/app/api/integrations/tally/vouchers/route.ts` (Lines 30-31)

**Before**:
```typescript
        const { rows: payments } = await pool.query(`
            SELECT
                p.id, p.amount, p.method, p.paid_at, p.provider_reference,
```

**After**:
```typescript
        const { rows: payments } = await pool.query(`
            SELECT
                p.id, p.amount, p.method, p.paid_at, p.transaction_id AS provider_reference,
```

---

## 4. Tally ERP Sync Integration Wiring Strategy

The `/integrations/tally` dashboard is currently static. It requires wiring for **Ledger Mapping**, **Sync History**, and an **Exceptions List**.

### 1. Client Export Form Wiring
* **Location**: `apps/web/src/app/(admin)/integrations/tally/TallyExportForm.tsx`
* **Wiring**: Currently requests `/api/integrations/tally/vouchers` with POST. To send custom mappings, we can add `mappings` state to the client form and pass it inside the request body.

### 2. Ledger Mapping Configuration
Since there is no dedicated `tally_mappings` table, we can provide a client-side mapping editor that saves mappings to `localStorage` (or adds a simple schema table `tally_mappings`).
To implement this in `/integrations/tally/page.tsx`:
* Fetch the mappings in the client side or via a database table.
* Pass the mappings to the Tally vouchers export API in the body:
```json
{
  "fromDate": "2026-06-01",
  "toDate": "2026-06-29",
  "mappings": {
    "CASH": "Cash",
    "CARD": "HDFC Bank",
    "UPI": "UPI Collections",
    "BANK_TRANSFER": "Bank Collections",
    "ONLINE": "Online Payments"
  }
}
```
* Update `/api/integrations/tally/vouchers/route.ts` to use `body.mappings` instead of the hardcoded `mapPaymentMethod` dictionary:
```typescript
const mappings = body.mappings || {
    'CASH': 'Cash',
    'CARD': 'HDFC Bank',
    'UPI': 'UPI Collections',
    'BANK_TRANSFER': 'Bank Collections',
    'ONLINE': 'Online Payments'
};
```

### 3. Exceptions List Card
Add a section listing payments that fail Tally import criteria (e.g. missing admission number or invalid data).
* **SQL Query to fetch exceptions**:
```sql
SELECT p.id, p.amount, p.method, p.paid_at, s.first_name || ' ' || s.last_name AS student_name, s.admission_number
FROM payments p
JOIN invoices i ON i.id = p.invoice_id
JOIN students s ON s.id = i.student_id
WHERE p.tenant_id = $1 AND (s.admission_number IS NULL OR s.admission_number = '')
```
* Display these list items in a Card labeled **"Import Exceptions & Warnings"** with a CTA to edit the student details.

---

## 5. Non-Existent `updated_at` Column Query Issues

The following tables do **not** have an `updated_at` column in the Drizzle schemas or migrations, but are queried with `updated_at AS "updatedAt"`.

### 1. Table `hq_groups` query in `hq.ts`
* **File**: `apps/web/src/lib/actions/hq.ts` (Line 16)
* **Fix**: Remove `updated_at AS "updatedAt"`.

**Before**:
```typescript
    const groupResult = await pool.query(
        'SELECT id, name, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM hq_groups WHERE is_active = $1 LIMIT 1',
        [true]
    );
```

**After**:
```typescript
    const groupResult = await pool.query(
        'SELECT id, name, is_active AS "isActive", created_at AS "createdAt" FROM hq_groups WHERE is_active = $1 LIMIT 1',
        [true]
    );
```

### 2. Table `platform_broadcasts` query in `hq/broadcasts/page.tsx`
* **File**: `apps/web/src/app/hq/broadcasts/page.tsx` (Line 17)
* **Fix**: Remove `updated_at AS "updatedAt"`.

**Before**:
```typescript
    const { rows: broadcastsList } = await pool.query(
        `SELECT *, created_at AS "createdAt", updated_at AS "updatedAt" FROM platform_broadcasts ORDER BY created_at DESC LIMIT 20`
    );
```

**After**:
```typescript
    const { rows: broadcastsList } = await pool.query(
        `SELECT id, title, message, target_tiers AS "targetTiers", target_modules AS "targetModules", is_active AS "isActive", type, expires_at AS "expiresAt", created_at AS "createdAt", created_by AS "createdBy" FROM platform_broadcasts ORDER BY created_at DESC LIMIT 20`
    );
```

### 3. Table `university_programs` query in `higher_ed.ts`
* **File**: `apps/web/src/lib/actions/higher_ed.ts` (Line 14)
* **Fix**: Remove `updated_at AS "updatedAt"`.

**Before**:
```typescript
    const result = await pool.query(
        'SELECT id, tenant_id AS "tenantId", name, degree_type AS "degreeType", created_at AS "createdAt", updated_at AS "updatedAt" FROM university_programs WHERE tenant_id = $1',
        [session.tenantId]
    );
```

**After**:
```typescript
    const result = await pool.query(
        'SELECT id, tenant_id AS "tenantId", name, degree_type AS "degreeType", created_at AS "createdAt" FROM university_programs WHERE tenant_id = $1',
        [session.tenantId]
    );
```

### 4. Tables `alumni_profiles` and `alumni_events` queries in `alumni.ts`
* **File**: `apps/web/src/lib/actions/alumni.ts` (Lines 8, 30, 47, 65)
* **Fix**: Remove `updated_at AS "updatedAt"`.

**Before (Lines 8 & 30)**:
```typescript
    let query = 'SELECT id, tenant_id AS "tenantId", name, email, phone, batch, current_company AS "currentCompany", designation, location, linked_in AS "linkedIn", is_verified AS "isVerified", created_at AS "createdAt", updated_at AS "updatedAt" FROM alumni_profiles WHERE tenant_id = $1';
...
RETURNING id, tenant_id AS "tenantId", ... is_verified AS "isVerified", created_at AS "createdAt", updated_at AS "updatedAt"
```

**After (Lines 8 & 30)**:
```typescript
    let query = 'SELECT id, tenant_id AS "tenantId", name, email, phone, batch, current_company AS "currentCompany", designation, location, linked_in AS "linkedIn", is_verified AS "isVerified", created_at AS "createdAt" FROM alumni_profiles WHERE tenant_id = $1';
...
RETURNING id, tenant_id AS "tenantId", ... is_verified AS "isVerified", created_at AS "createdAt"
```

**Before (Lines 47 & 65)**:
```typescript
    let query = 'SELECT id, tenant_id AS "tenantId", title, ... status, created_at AS "createdAt", updated_at AS "updatedAt" FROM alumni_events WHERE tenant_id = $1';
...
RETURNING id, tenant_id AS "tenantId", ... status, created_at AS "createdAt", updated_at AS "updatedAt"
```

**After (Lines 47 & 65)**:
```typescript
    let query = 'SELECT id, tenant_id AS "tenantId", title, ... status, created_at AS "createdAt" FROM alumni_events WHERE tenant_id = $1';
...
RETURNING id, tenant_id AS "tenantId", ... status, created_at AS "createdAt"
```

---

## 6. Syntax Error compiler bugs (`await ('platform');`)

Several action and page files contain the invalid code fragment `await ('platform');` which will fail TypeScript compilation.

### Affected Files:
* `apps/web/src/app/hq/broadcasts/page.tsx` (Line 13)
* `apps/web/src/app/hq/leads/page.tsx` (Line 13)
* `apps/web/src/lib/actions/platform.ts` (Lines 34, 88, 133, 189, 209, 261, 287, 319, 349, 392, 410, 434, 446)

### Fix Strategy:
Completely delete all lines containing `await ('platform');`.

---

## 7. Casing Mismatch in `hq/treasury/page.tsx`

### Issue:
The file `apps/web/src/app/hq/treasury/page.tsx` queries:
`SELECT payment_method, SUM(amount)::int ... FROM payments GROUP BY payment_method`
But the `payments` table contains `"method"` instead of `"payment_method"`.

Furthermore, the frontend component (`TreasuryClient`) expects property `payment_method`.

### Fix Strategy:
Query the column `method` but alias it as `payment_method` in the SQL select block.

### Code Modification:
**Target File**: `apps/web/src/app/hq/treasury/page.tsx` (Lines 15-23)

**Before**:
```typescript
    const { rows: methodAggregates } = await pool.query(`
        SELECT 
            payment_method, 
            SUM(amount)::int as total_volume,
            COUNT(*)::int as txn_count
        FROM payments 
        WHERE status = 'COMPLETED'
        GROUP BY payment_method
    `);
```

**After**:
```typescript
    const { rows: methodAggregates } = await pool.query(`
        SELECT 
            method AS payment_method, 
            SUM(amount)::int as total_volume,
            COUNT(*)::int as txn_count
        FROM payments 
        WHERE status = 'COMPLETED'
        GROUP BY method
    `);
```

---

## 8. Alignment of `alumni.service.ts`

### Discrepancy:
`alumni.service.ts` attempts to query a table `alumni` with `first_name`, `last_name`, `current_org`, `city`, `is_active`, and `donation_amount`.
However, Drizzle defines table `alumni_profiles` with `name`, `email`, `phone`, `batch`, `graduation_year`, `current_company`, `designation`, `location`, `linkedin`, and `is_verified`.

### Fix Strategy:
Rewrite `alumni.service.ts` to target `alumni_profiles` and map fields correctly.

### Proposed Code for `apps/web/src/lib/services/alumni/alumni.service.ts`:

```typescript
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Alumni { 
    id: string; 
    name: string; 
    graduationYear: number | null; 
    email: string; 
    phone: string | null; 
    currentOrg: string | null; 
    designation: string | null; 
    city: string | null; 
    isActive: boolean; 
    donationAmount: number; 
}

export const AlumniService = {
    async getAlumni(tenantId: string, filters?: { year?: number; search?: string }): Promise<Alumni[]> {
        const rows = await db.execute(sql`
            SELECT 
                id, 
                name, 
                graduation_year AS "graduationYear", 
                email, 
                phone, 
                current_company AS "currentOrg", 
                designation, 
                location AS "city", 
                is_verified AS "isActive",
                0 AS "donationAmount"
            FROM alumni_profiles 
            WHERE tenant_id = ${tenantId} 
            ${filters?.year ? sql`AND graduation_year = ${filters.year}` : sql``} 
            ${filters?.search ? sql`AND name ILIKE ${'%' + filters.search + '%'}` : sql``} 
            ORDER BY graduation_year DESC, name LIMIT 200
        `);
        return rows as unknown as Alumni[];
    },

    async getStats(tenantId: string) {
        const [s] = await db.execute(sql`
            SELECT 
                COUNT(*) AS total, 
                COUNT(*) FILTER(WHERE is_verified = true) AS active, 
                0 AS "totalDonations", 
                COUNT(DISTINCT graduation_year) AS batches 
            FROM alumni_profiles 
            WHERE tenant_id = ${tenantId}
        `) as any[];
        return { 
            totalAlumni: Number(s?.total || 0), 
            activeAlumni: Number(s?.active || 0), 
            totalDonations: Number(s?.totalDonations || 0), 
            batches: Number(s?.batches || 0) 
        };
    },
};
```

---

## 9. Implementation Strategy for International Student Operations

The path `/international` points to a static student operations page (Visas, Host Families, Placements).

### Step 1: Create Server Actions File `apps/web/src/lib/actions/international.ts`

```typescript
'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

// Visa Compliance Actions
export async function getStudentVisasAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');
    
    const { rows } = await pool.query(`
        SELECT sv.id, sv.visa_type AS "visaType", sv.country_of_origin AS "countryOfOrigin",
               sv.passport_number AS "passportNumber", sv.issue_date AS "issueDate",
               sv.expiration_date AS "expirationDate",
               s.first_name || ' ' || s.last_name AS "studentName"
        FROM student_visas sv
        JOIN students s ON sv.student_id = s.id
        WHERE sv.tenant_id = $1
        ORDER BY sv.expiration_date ASC
    `, [session.tenantId]);
    return rows;
}

export async function createStudentVisaAction(data: {
    studentId: string; visaType: string; countryOfOrigin: string; passportNumber: string; issueDate: string; expirationDate: string;
}) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO student_visas (tenant_id, student_id, visa_type, country_of_origin, passport_number, issue_date, expiration_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [session.tenantId, data.studentId, data.visaType, data.countryOfOrigin, data.passportNumber, data.issueDate, data.expirationDate]);

    revalidatePath('/international');
    return { success: true };
}

// Host Family Actions
export async function getHostFamiliesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(`
        SELECT id, family_name AS "familyName", address, phone, background_checked AS "backgroundChecked"
        FROM host_families
        WHERE tenant_id = $1
        ORDER BY family_name ASC
    `, [session.tenantId]);
    return rows;
}

export async function createHostFamilyAction(data: { familyName: string; address: string; phone: string; backgroundChecked?: string }) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO host_families (tenant_id, family_name, address, phone, background_checked)
        VALUES ($1, $2, $3, $4, $5)
    `, [session.tenantId, data.familyName, data.address, data.phone, data.backgroundChecked || null]);

    revalidatePath('/international');
    return { success: true };
}

// Placement Actions
export async function getInternationalPlacementsAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(`
        SELECT ip.id, ip.placement_year AS "placementYear",
               s.first_name || ' ' || s.last_name AS "studentName",
               hf.family_name AS "hostFamilyName"
        FROM international_placements ip
        JOIN students s ON ip.student_id = s.id
        LEFT JOIN host_families hf ON ip.host_family_id = hf.id
        WHERE ip.tenant_id = $1
        ORDER BY ip.placement_year DESC
    `, [session.tenantId]);
    return rows;
}

export async function createInternationalPlacementAction(data: { studentId: string; hostFamilyId?: string; placementYear: string }) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO international_placements (tenant_id, student_id, host_family_id, placement_year)
        VALUES ($1, $2, $3, $4)
    `, [session.tenantId, data.studentId, data.hostFamilyId || null, data.placementYear]);

    revalidatePath('/international');
    return { success: true };
}
```

### Step 2: Wire the Actions into `/international/page.tsx`
Convert the page to a hybrid server/client page, or fetch lists directly using these actions to make the UI dynamic:
```typescript
import { getStudentVisasAction, getHostFamiliesAction, getInternationalPlacementsAction } from '@/lib/actions/international';

export default async function InternationalDashboard() {
    const visas = await getStudentVisasAction();
    const families = await getHostFamiliesAction();
    const placements = await getInternationalPlacementsAction();
    // Render list views, badge counts, and forms to add new records
}
```

---

## 10. Aligning Queries on Exam Results and Schedules

### Issue:
Several files query tables/columns from old/hallucinated schemas:
* Table name: `exam_results` (should be `student_results`)
* Table name: `exam_subjects` (should be `exam_schedules`)
* Column name: `exam_subject_id` (should be `exam_schedule_id`)
* Column name: `total_marks` (should be `max_marks` from `exam_schedules`)
* Column name: `es.name` or `es.subject_code` (does not exist in `exam_schedules`; join `subjects` to select `sub.name` or `sub.code`)

### Required Fixes:

#### 1. `apps/web/src/lib/actions/analytics.ts`
* Update lines 24, 58, 77, 120, and 135 to join `student_results`, `exam_schedules`, and `subjects` tables. Refer to corrected SQL blocks:

```sql
-- getAnalyticsSummary exam avg query (Line 24):
(SELECT ROUND(AVG(marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 1) 
 FROM student_results er 
 JOIN exam_schedules es ON es.id = er.exam_schedule_id 
 JOIN exams e ON e.id = es.exam_id 
 WHERE e.tenant_id = $1) AS exam_avg

-- getClassWiseSummary query (Line 58):
SELECT g.name AS label,
       ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 0) AS value
FROM student_results er
JOIN exam_schedules es ON es.id = er.exam_schedule_id
JOIN exams e ON e.id = es.exam_id
JOIN students s ON s.id = er.student_id
LEFT JOIN sections sec ON sec.id = s.section_id
LEFT JOIN grades g ON g.id = sec.grade_id
WHERE e.tenant_id = $1
GROUP BY g.name, g.display_order ORDER BY g.display_order

-- getTopPerformers query (Line 74):
SELECT s.first_name || ' ' || s.last_name AS name,
       g.name AS class,
       ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 1) AS percentage
FROM student_results er
JOIN students s ON s.id = er.student_id
JOIN exam_schedules es ON es.id = er.exam_schedule_id
JOIN exams e ON e.id = es.exam_id
LEFT JOIN sections sec ON sec.id = s.section_id
LEFT JOIN grades g ON g.id = sec.grade_id
WHERE e.tenant_id = $1
GROUP BY s.id, s.first_name, s.last_name, g.name
ORDER BY percentage DESC LIMIT 10

-- getSubjectPerformance query (Line 120):
SELECT sub.name AS label,
       ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 0) AS value
FROM student_results er
JOIN exam_schedules es ON es.id = er.exam_schedule_id
JOIN subjects sub ON sub.id = es.subject_id
JOIN exams e ON e.id = es.exam_id
WHERE e.tenant_id = $1
GROUP BY sub.name ORDER BY value DESC

-- getExamClassPerformance query (Line 135):
SELECT g.name AS class, sec.name AS section,
       ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 1) AS "averagePercent",
       ROUND(COUNT(*) FILTER(WHERE er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100 >= 40)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS "passPercent"
FROM student_results er
JOIN students s ON s.id = er.student_id
JOIN exam_schedules es ON es.id = er.exam_schedule_id
JOIN exams e ON e.id = es.exam_id
LEFT JOIN sections sec ON sec.id = s.section_id
LEFT JOIN grades g ON g.id = sec.grade_id
WHERE e.tenant_id = $1
GROUP BY g.name, sec.name, g.display_order
ORDER BY g.display_order, sec.name
```

#### 2. `apps/web/src/lib/services/analytics/analytics.service.ts`
* Update `getExamPerformance` (Line 13):

```typescript
    async getExamPerformance(tenantId: string) {
        const rows = await db.execute(sql`
            SELECT 
                e.name AS "examName",
                sub.name AS subject,
                ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100), 1) AS "avgPct",
                COUNT(DISTINCT er.student_id) AS students,
                COUNT(*) FILTER(WHERE er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100 >= 90) AS "above90",
                COUNT(*) FILTER(WHERE er.marks_obtained::numeric / NULLIF(es.max_marks, 0) * 100 < 40) AS "below40" 
            FROM student_results er 
            JOIN exam_schedules es ON es.id = er.exam_schedule_id 
            JOIN subjects sub ON sub.id = es.subject_id 
            JOIN exams e ON e.id = es.exam_id 
            WHERE e.tenant_id = ${tenantId} 
            GROUP BY e.name, sub.name 
            ORDER BY e.name, sub.name
        `);
        return rows;
    }
```

#### 3. `apps/web/src/app/api/exports/cbse-results/route.ts`
* Update SQL query in Candidates Candidates List export:

```typescript
        const { rows: data } = await pool.query(`
            SELECT
                s.admission_number AS "Roll Number",
                s.first_name || ' ' || s.last_name AS "Candidate Name",
                s.gender AS "Gender",
                s.date_of_birth AS "DOB",
                s.category AS "Category",
                g.name AS "Class",
                sub.name AS "Subject",
                sub.code AS "Subject Code",
                er.marks_obtained AS "Marks Obtained",
                es.max_marks AS "Total Marks",
                er.grade AS "Grade"
            FROM student_results er
            JOIN exam_schedules es ON es.id = er.exam_schedule_id
            JOIN subjects sub ON sub.id = es.subject_id
            JOIN exams e ON e.id = es.exam_id
            JOIN students s ON s.id = er.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE e.tenant_id = $1
            ${examClause}
            ORDER BY g.display_order, s.admission_number, sub.name
        `, params);
```

#### 4. `apps/web/src/lib/privacy/dpdpa.ts`
* Update `examData` export query (Lines 205-212):

```typescript
    const examData = await db.execute(sql`
        SELECT e.name as exam_name, sub.name as subject, er.marks_obtained, es.max_marks as total_marks, er.grade
        FROM student_results er
        JOIN exam_schedules es ON es.id = er.exam_schedule_id
        JOIN subjects sub ON sub.id = es.subject_id
        JOIN exams e ON e.id = es.exam_id
        WHERE er.student_id = ${studentId}
        ORDER BY e.created_at DESC
    `);
```

---

## 11. Verification Methods

The correctness of the proposed changes can be verified as follows:

1. **Static Analysis & Compilation Check**:
   * Run next build or typescript validation to ensure no missing properties/syntax errors exist:
     ```bash
     cd apps/web && pnpm tsc --noEmit
     ```
2. **Execute Unit Test suite**:
   * Verify that existing services and mock assertions pass:
     ```bash
     cd apps/web && pnpm test
     ```
3. **Database Integrity & Integration Test**:
   * Initialize local postgres and run:
     ```bash
     pnpm test:e2e
     ```
