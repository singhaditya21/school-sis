CREATE TYPE "public"."exam_result_review_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
ALTER TABLE "student_results" ADD COLUMN "review_status" "exam_result_review_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_results" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "student_results" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "student_results" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "student_results" AS result
SET
	"review_status" = 'VERIFIED',
	"reviewed_by" = COALESCE(
		(
			SELECT hash."locked_by"
			FROM "exam_result_hashes" AS hash
			WHERE hash."tenant_id" = result."tenant_id"
			  AND hash."result_id" = result."id"
			ORDER BY hash."locked_at" ASC, hash."id" ASC
			LIMIT 1
		),
		exam."published_by"
	),
	"reviewed_at" = COALESCE(
		(
			SELECT hash."locked_at"
			FROM "exam_result_hashes" AS hash
			WHERE hash."tenant_id" = result."tenant_id"
			  AND hash."result_id" = result."id"
			ORDER BY hash."locked_at" ASC, hash."id" ASC
			LIMIT 1
		),
		exam."published_at",
		result."updated_at"
	)
FROM "exam_schedules" AS schedule
INNER JOIN "exams" AS exam ON exam."id" = schedule."exam_id"
WHERE result."exam_schedule_id" = schedule."id"
  AND exam."tenant_id" = result."tenant_id"
  AND (
	EXISTS (
		SELECT 1
		FROM "exam_result_hashes" AS hash
		WHERE hash."tenant_id" = result."tenant_id"
		  AND hash."result_id" = result."id"
	)
	OR exam."status" = 'PUBLISHED'
  );--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_student_results_tenant_review_status" ON "student_results" USING btree ("tenant_id","review_status","reviewed_at");
