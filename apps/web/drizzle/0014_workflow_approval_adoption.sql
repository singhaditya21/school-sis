SELECT set_config('app.bypass_rls', 'on', false);
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'GROUP_EXECUTIVE';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'REGISTRAR';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'FINANCE_LEAD';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'STUDENT_SUCCESS_COUNSELOR';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'TRUST_OFFICER';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'CREDENTIAL_OFFICER';
--> statement-breakpoint
ALTER TABLE "exams"
    ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
    ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "published_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "exams" e
SET "status" = 'RESULT_REVIEW',
    "updated_at" = NOW()
WHERE e."status" = 'DRAFT'
  AND EXISTS (
      SELECT 1
      FROM "exam_schedules" es
      INNER JOIN "student_results" sr
          ON sr."exam_schedule_id" = es."id"
         AND sr."tenant_id" = e."tenant_id"
      WHERE es."exam_id" = e."id"
  );
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_status_check') THEN
        ALTER TABLE "exams"
            ADD CONSTRAINT "exams_status_check"
            CHECK ("status" IN ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULT_REVIEW', 'PUBLISHED', 'ARCHIVED', 'CANCELLED'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_tenant_status"
    ON "exams" USING btree ("tenant_id", "status");
--> statement-breakpoint
DELETE FROM "exam_result_hashes" newer
USING "exam_result_hashes" older
WHERE newer."result_id" = older."result_id"
  AND (
      newer."locked_at" > older."locked_at"
      OR (newer."locked_at" = older."locked_at" AND newer."id" > older."id")
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_result_hashes_result"
    ON "exam_result_hashes" USING btree ("result_id");
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'off', false);
