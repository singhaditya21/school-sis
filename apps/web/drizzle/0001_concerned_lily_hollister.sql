CREATE TABLE "ai_budget_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scope_kind" varchar(16) NOT NULL,
	"scope_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"reserved_tokens" bigint DEFAULT 0 NOT NULL,
	"used_tokens" bigint DEFAULT 0 NOT NULL,
	"reserved_cost_microusd" bigint DEFAULT 0 NOT NULL,
	"used_cost_microusd" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_budget_usage_scope_period_key" UNIQUE("scope_kind","scope_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "provider" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "request_status" varchar(24) DEFAULT 'COMPLETED' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD COLUMN "failure_reason" varchar(160);--> statement-breakpoint
ALTER TABLE "ai_budget_usage" ADD CONSTRAINT "ai_budget_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_budget_usage_tenant_period" ON "ai_budget_usage" USING btree ("tenant_id","period_start");--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD CONSTRAINT "ai_token_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_budget_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_budget_usage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "ai_budget_usage"
AS PERMISSIVE FOR ALL
USING (
	COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
	OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
)
WITH CHECK (
	COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
	OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
);
