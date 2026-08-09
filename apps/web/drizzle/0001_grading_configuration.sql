ALTER TABLE "grading_rubrics" ADD COLUMN "remark" text;--> statement-breakpoint
ALTER TABLE "grading_rubrics" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grading_rubrics" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "grading_scales" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "grading_scales" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "grading_scales" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grading_scales" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
WITH ranked_rubrics AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY scale_id
			ORDER BY max_score DESC NULLS LAST, min_score DESC NULLS LAST, created_at ASC, id ASC
		) - 1 AS display_order
	FROM "grading_rubrics"
)
UPDATE "grading_rubrics" AS rubric
SET "display_order" = ranked.display_order
FROM ranked_rubrics AS ranked
WHERE rubric.id = ranked.id;--> statement-breakpoint
WITH ranked_scales AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY tenant_id
			ORDER BY created_at ASC, id ASC
		) AS tenant_order
	FROM "grading_scales"
)
UPDATE "grading_scales" AS scale
SET "is_default" = (ranked.tenant_order = 1)
FROM ranked_scales AS ranked
WHERE scale.id = ranked.id;--> statement-breakpoint
CREATE INDEX "idx_grading_rubrics_scale_order" ON "grading_rubrics" USING btree ("scale_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_grading_scales_tenant_active" ON "grading_scales" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grading_scales_tenant_default" ON "grading_scales" USING btree ("tenant_id") WHERE "grading_scales"."is_default" = true;
