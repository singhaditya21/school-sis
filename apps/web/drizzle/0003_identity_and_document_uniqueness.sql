-- Uniqueness for identities and financial/academic document numbers.
--
-- None of these were constrained, so the database happily accepted two users
-- with the same email in one tenant, two staff records with the same employee
-- id, two exam papers for the same subject in the same class, and two receipts
-- carrying the same receipt number.
--
-- Each index is preceded by a check that raises a descriptive error naming the
-- conflicting rows. A bare unique violation during a production migration tells
-- an operator almost nothing; this tells them exactly what to clean up.

DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('tenant %s / %s (%s rows)', tenant_id, email, n), '; ')
    INTO conflicts
    FROM (
        SELECT tenant_id, lower(email) AS email, count(*) AS n
        FROM users GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on users(tenant_id, lower(email)): %', conflicts;
    END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_tenant_email"
    ON "users" ("tenant_id", lower("email"));
--> statement-breakpoint

DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('tenant %s / %s (%s rows)', tenant_id, employee_id, n), '; ')
    INTO conflicts
    FROM (
        SELECT tenant_id, employee_id, count(*) AS n
        FROM staff_profiles WHERE employee_id IS NOT NULL
        GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on staff_profiles(tenant_id, employee_id): %', conflicts;
    END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_profiles_tenant_employee_id"
    ON "staff_profiles" ("tenant_id", "employee_id")
    WHERE "employee_id" IS NOT NULL;
--> statement-breakpoint

DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('exam %s / grade %s / subject %s (%s rows)', exam_id, grade_id, subject_id, n), '; ')
    INTO conflicts
    FROM (
        SELECT exam_id, grade_id, subject_id, count(*) AS n
        FROM exam_schedules GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on exam_schedules(exam_id, grade_id, subject_id): %', conflicts;
    END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_schedules_exam_grade_subject"
    ON "exam_schedules" ("exam_id", "grade_id", "subject_id");
--> statement-breakpoint

DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('tenant %s / %s (%s rows)', tenant_id, receipt_number, n), '; ')
    INTO conflicts
    FROM (
        SELECT tenant_id, receipt_number, count(*) AS n
        FROM receipts GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on receipts(tenant_id, receipt_number): %', conflicts;
    END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_receipts_tenant_receipt_number"
    ON "receipts" ("tenant_id", "receipt_number");
