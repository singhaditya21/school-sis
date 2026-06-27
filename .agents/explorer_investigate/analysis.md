# Migration Analysis: Scaffolding Bridge Deprecation

This report outlines findings and migration plans for transitioning five modules off `scaffolding-bridge.ts` into native, secure, and well-structured server actions.

---

## 1. Scaffolding Bridge Exports & Current Functions

The file `apps/web/src/lib/actions/scaffolding-bridge.ts` acts as a temporary data layer containing raw SQL queries without permission checks. Below is a breakdown of exports mapped to the target modules:

### Hostel Module
* **Function**: `getHostelFees(status?: string, feeType?: string)`
* **SQL Query**:
  ```sql
  SELECT hf.id, s.admission_number AS "studentId", s.first_name||' '||s.last_name AS "studentName",
         g.name||'-'||sec.name AS class, h.name AS "hostelName", hr.room_number AS "roomNumber",
         hf.fee_type AS "feeType", hf.amount, hf.due_date AS "dueDate", hf.status, hf.paid_date AS "paidDate"
  FROM hostel_fees hf
  JOIN students s ON s.id = hf.student_id
  LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
  LEFT JOIN hostel_allocations ha ON ha.student_id = s.id AND ha.is_active = true
  LEFT JOIN hostels h ON h.id = ha.hostel_id
  LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
  WHERE hf.tenant_id = $1
  ```
* **Parameters**: `tenantId` (from session), optional `status`, optional `feeType`.
* **Ordering / Limits**: `ORDER BY hf.due_date DESC LIMIT 100`

### Library Module
* **Function**: `getLibraryStudents()`
* **SQL Query**:
  ```sql
  SELECT s.id, s.admission_number AS "admissionNo", s.first_name||' '||s.last_name AS name,
         g.name||'-'||sec.name AS class
  FROM students s 
  LEFT JOIN sections sec ON sec.id = s.section_id 
  LEFT JOIN grades g ON g.id = sec.grade_id
  WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
  ```
* **Ordering / Limits**: `ORDER BY s.first_name LIMIT 100`

### Timetable Substitution Module
* **Function 1**: `getSubstitutionTeachers()`
  * **SQL Query**:
    ```sql
    SELECT u.id, u.first_name||' '||u.last_name AS name, u.department AS subject, u.is_active AS available
    FROM users u WHERE u.tenant_id = $1 AND u.role = 'TEACHER'
    ```
  * **Ordering / Limits**: `ORDER BY u.first_name`
* **Function 2**: `getSubstitutionRequests()`
  * **SQL Query**:
    ```sql
    SELECT sr.id, u.first_name||' '||u.last_name AS "originalTeacher", sr.reason,
           g.name||'-'||sec.name AS class, sr.period, sr.date,
           sub_u.first_name||' '||sub_u.last_name AS substitute, sr.status
    FROM substitution_requests sr
    JOIN users u ON u.id = sr.teacher_id
    LEFT JOIN users sub_u ON sub_u.id = sr.substitute_id
    LEFT JOIN sections sec ON sec.id = sr.section_id LEFT JOIN grades g ON g.id = sec.grade_id
    WHERE sr.tenant_id = $1
    ```
  * **Ordering / Limits**: `ORDER BY sr.date DESC LIMIT 50`

### Diary & Appointments Modules
* **Diary Function**: `getDiaryEntries()`
  * **SQL Query**:
    ```sql
    SELECT d.id, d.title, d.content, d.date, g.name AS class, sec.name AS section,
           sub.name AS subject, u.first_name||' '||u.last_name AS "teacherName", d.type
    FROM diary_entries d
    LEFT JOIN grades g ON g.id = d.grade_id LEFT JOIN sections sec ON sec.id = d.section_id
    LEFT JOIN subjects sub ON sub.id = d.subject_id LEFT JOIN users u ON u.id = d.teacher_id
    WHERE d.tenant_id = $1
    ```
  * **Ordering / Limits**: `ORDER BY d.date DESC LIMIT 50`
* **Appointments Function**: `getAppointments()`
  * **SQL Query**:
    ```sql
    SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
           u.first_name||' '||u.last_name AS "with", a.status, a.type
    FROM appointments a LEFT JOIN users u ON u.id = a.with_user_id
    WHERE a.tenant_id = $1
    ```
  * **Ordering / Limits**: `ORDER BY a.date DESC, a.time DESC LIMIT 50`

### Gradebook Module
* **Function**: `getGradebookData(classId?: string)` (Redundant/Unused)
  * **Details**: Fetches all grades, recent 10 exams, and active student list for a grade.
  * **Status**: Redundant. The active Gradebook page (`apps/web/src/app/teacher/gradebook/page.tsx`) queries the database using `getAdvancedGradebook` from `@/lib/actions/exams.ts` directly.

---

## 2. Database Schema, Tables, and Configuration

### Configuration & Tenancy
* **Connection Pool**: Enforces `pg.Pool` instance inside `apps/web/src/lib/db/index.ts`. Max connections, timeouts, and production SSL settings are dynamically queried via `getLimit('DB_POOL_MAX')`.
* **Tenant Isolation**: Row-Level Security (RLS) is scoped using PostgreSQL's transaction settings via the `withTenant` wrapper:
  ```typescript
  export async function withTenant<T>(tenantId: string, fn: (client: any) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
      } catch (e) {
          await client.query('ROLLBACK');
          throw e;
      } finally {
          client.release();
      }
  }
  ```

### Table Schemas & Discrepancies
The migration schema file `apps/web/drizzle/0000_init_native_postgres.sql` defines core tables (like `students`, `hostels`, `books`, `substitutions`, etc.). However, there are discrepancies between scaffolding queries and the migration schema:

1. **Substitution vs. Substitution Requests**:
   * Scaffolding queries `substitution_requests` table with fields `status`, `period`, and `section_id`.
   * Migration schema only has a `substitutions` table:
     ```sql
     CREATE TABLE "substitutions" (
         "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
         "tenant_id" uuid NOT NULL,
         "timetable_entry_id" uuid NOT NULL,
         "original_teacher_id" uuid NOT NULL,
         "substitute_teacher_id" uuid NOT NULL,
         "date" varchar(10) NOT NULL,
         "reason" varchar(255),
         "created_at" timestamp with time zone DEFAULT now() NOT NULL
     );
     ```
   * *Impact*: The `substitutions` schema is missing `status`, `period`, and `section_id`. These fields must be joined via `timetable_entry_id` pointing to `timetable_entries` and `periods`.
2. **Missing Scaffolding Tables in Migration Schema**:
   * The tables `hostel_fees`, `diary_entries`, and `appointments` are queried in the scaffolding bridge but **do not exist** in the `0000_init_native_postgres.sql` file.
   * *Impact*: To migrate, these tables must either be officially defined in migrations, or mock database tables must be initialized for local development.
3. **Exam Results Table Conflict**:
   * Core actions (`lib/actions/exams.ts`) query `student_results` and `exam_schedules`.
   * Parent service (`lib/services/parent/parent.service.ts`) queries `exam_results` and `exam_subjects`, which do not exist in the migration schema.
   * *Impact*: Parent portal and exam actions should be aligned to use `student_results` and `exam_schedules` to avoid database errors in production.

---

## 3. Frontend UI Pages & Components

Below is the file path index and state-management mapping for each module's UI:

| Module | Route / Page File | Action Imports | Component Type |
|---|---|---|---|
| **Gradebook** | `teacher/gradebook/page.tsx` | `getAdvancedGradebook` (`@/lib/actions/exams`) | Server Component |
| **Hostel** | `(admin)/hostel/fees/page.tsx`<br>`(admin)/hostel/page.tsx` | `getHostelFees` (`scaffolding-bridge`) <br> `getHostels`, `getHostelStats` (`hostel`) | Client Component<br>Server Component |
| **Timetable Substitution** | `(admin)/timetable/substitution/page.tsx` | `getSubstitutionTeachers`, `getSubstitutionRequests` | Client Component |
| **Library** | `(admin)/library/issue/page.tsx`<br>`(admin)/library/page.tsx`<br>`(admin)/library/history/page.tsx` | `getLibraryStudents` (`scaffolding-bridge`) <br> `getBooks`, `getLibraryStats` (`library`) <br> Direct `pool.query` | Client Component<br>Server Component<br>Server Component |
| **Diary** | `(admin)/diary/page.tsx` | `getDiaryEntries` (`scaffolding-bridge`) | Client Component |
| **Appointments** | `(admin)/appointments/page.tsx` | `getAppointments` (`scaffolding-bridge`) | Client Component |

---

## 4. Reference Implementation: Parent Portal

The Parent Portal results page (`apps/web/src/app/(parent)/my-results/page.tsx`) serves as the standard template for migrations:

1. **Security & Session Identification**:
   * Uses server action imports (`getMyResults` from `@/lib/services/parent/parent.service`).
   * The action verifies credentials and tenant context in a single call:
     ```typescript
     const { tenantId, userId } = await requireAuth('parent:read');
     ```
2. **Data Isolation (RLS)**:
   * Queries filter by parent ownership, only displaying results of students whose `guardian_user_id` matches the session user ID:
     ```sql
     JOIN students s ON s.id = er.student_id
     WHERE e.tenant_id = $1 AND s.guardian_user_id = $2
     ```
3. **Data Type Coercion**:
   * Converts decimal/numeric string outputs from `pg` driver explicitly into JavaScript floats/integers:
     ```typescript
     marksObtained: Number(r.marksObtained),
     totalMarks: Number(r.totalMarks),
     percentage: Number(r.percentage)
     ```
4. **UI Layout / Components**:
   * Implements Radix-based shadcn components instead of raw HTML elements:
     * `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableHead>`, `<TableBody>`, `<TableCell>` from `@/components/ui/table`.
     * `<Badge>` from `@/components/ui/badge` for status values.
     * `<Card>`, `<CardContent>` from `@/components/ui/card` for layout wrappers.

---

## 5. Actionable Migration Plan

### Step 1: Clean Up Redundant Code
* **Gradebook**: Delete `getGradebookData()` from `scaffolding-bridge.ts`. The UI already uses `getAdvancedGradebook()` in `lib/actions/exams.ts`.

### Step 2: Establish Permissions
Before writing the server actions, ensure permissions are registered in `apps/web/src/lib/rbac/permissions.ts`.
* Add `hostel:*`, `library:*`, `timetable:*`, `diary:*`, and `appointments:*` under the `SCHOOL_ADMIN` and `TEACHER` roles as needed.

### Step 3: Migrate Actions
* **Hostel**: Move `getHostelFees` to `lib/actions/hostel.ts`. Add `requireAuth('hostel:read')`.
* **Library**: Add `getLibraryStudents` to `lib/actions/library.ts` (or `lib/actions/students.ts`). Add `requireAuth('library:read')`.
* **Timetable Substitution**: Move `getSubstitutionTeachers` and `getSubstitutionRequests` to `lib/actions/timetable.ts`. Change queries to match the `substitutions` table schema (using joins instead of `substitution_requests`). Add `requireAuth('timetable:read')`.
* **Diary**: Create `lib/actions/diary.ts`. Implement `getDiaryEntries`. Add `requireAuth('diary:read')`.
* **Appointments**: Create `lib/actions/appointments.ts`. Implement `getAppointments`. Add `requireAuth('appointments:read')`.

### Step 4: Refactor Frontend Code
* Update the import statements in client pages (`(admin)/hostel/fees/page.tsx`, `(admin)/timetable/substitution/page.tsx`, `(admin)/library/issue/page.tsx`, `(admin)/diary/page.tsx`, and `(admin)/appointments/page.tsx`) to reference the newly created module actions.
* Migrate `library/history/page.tsx`'s inline database query into a dedicated action inside `lib/actions/library.ts`.
* Convert the table structures in the page files to use shadcn Table components (`@/components/ui/table`) like the Parent Portal results implementation.
