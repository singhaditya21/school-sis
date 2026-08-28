CREATE TABLE "hardware_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"token_id" varchar(256) NOT NULL,
	"hardware_type" varchar(40) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"label" varchar(120),
	"issued_by" uuid,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_tokens_tenant_token_key" UNIQUE("tenant_id","token_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fcm_token" varchar(512);--> statement-breakpoint
ALTER TABLE "hardware_tokens" ADD CONSTRAINT "hardware_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_tokens" ADD CONSTRAINT "hardware_tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_tokens" ADD CONSTRAINT "hardware_tokens_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_tokens" ADD CONSTRAINT "hardware_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hardware_tokens_tenant_token_active" ON "hardware_tokens" USING btree ("tenant_id","token_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_hardware_tokens_tenant_student" ON "hardware_tokens" USING btree ("tenant_id","student_id");