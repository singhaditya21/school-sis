-- Protect Phase 4 international passport identifiers with the same expand/backfill/
-- contract pattern used by the earlier PII migrations. Reads remain tolerant during
-- rollout; application writes move immediately to passport_number_enc.
ALTER TABLE "student_visas" ADD COLUMN "passport_number_enc" text;--> statement-breakpoint
ALTER TABLE "student_visas" ALTER COLUMN "passport_number" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_student_visas_tenant_expiration" ON "student_visas" ("tenant_id", "expiration_date");
