-- Billing integrity for invoices.
--
-- Two defects this closes:
--   1. invoice_number had no uniqueness of any kind, so a collision would
--      silently produce two invoices a school could not tell apart.
--   2. Bulk generation had no database-level duplicate guard. The application
--      now pre-checks, but a concurrent re-run of the same fee plan for the same
--      due date could still bill every student a second time.
--
-- The partial index deliberately excludes CANCELLED invoices: a cancelled
-- invoice must not block re-issuing a corrected one for the same plan and date.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoices_tenant_invoice_number"
    ON "invoices" ("tenant_id", "invoice_number");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoices_tenant_student_plan_due_live"
    ON "invoices" ("tenant_id", "student_id", "fee_plan_id", "due_date")
    WHERE "status" <> 'CANCELLED';
