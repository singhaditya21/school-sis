CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "key" text PRIMARY KEY NOT NULL,
    "count" integer NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "locked_until" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_expires" ON "rate_limit_buckets" ("expires_at");
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "rate_limit_buckets_platform_access" ON "rate_limit_buckets";
--> statement-breakpoint
CREATE POLICY "rate_limit_buckets_platform_access"
    ON "rate_limit_buckets"
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_students_tenant_status_grade_section" ON "students" ("tenant_id", "status", "grade_id", "section_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_students_tenant_admission_number" ON "students" ("tenant_id", "admission_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guardians_tenant_student_primary" ON "guardians" ("tenant_id", "student_id", "is_primary");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guardians_tenant_user" ON "guardians" ("tenant_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_status_due" ON "invoices" ("tenant_id", "status", "due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_student_status" ON "invoices" ("tenant_id", "student_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_due" ON "invoices" ("tenant_id", "due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_tenant_status_paid" ON "payments" ("tenant_id", "status", "paid_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_tenant_invoice" ON "payments" ("tenant_id", "invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_tenant_student_paid" ON "payments" ("tenant_id", "student_id", "paid_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_date_status" ON "attendance_records" ("tenant_id", "date", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_student_date" ON "attendance_records" ("tenant_id", "student_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_section_date" ON "attendance_records" ("tenant_id", "section_id", "date");
