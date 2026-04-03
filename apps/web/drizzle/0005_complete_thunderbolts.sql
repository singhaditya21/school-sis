CREATE TABLE "ai_token_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_type" varchar(150) NOT NULL,
	"model" varchar(100) NOT NULL,
	"tokens_used" integer NOT NULL,
	"compute_cost_ms" integer NOT NULL,
	"query_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_company_id" uuid,
	"target_tenant_id" uuid,
	"action_type" varchar(255) NOT NULL,
	"metadata" text,
	"ip_address" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"target_tiers" text[],
	"target_modules" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"type" varchar(50) DEFAULT 'INFO' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "region" varchar(50) DEFAULT 'US-EAST' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "domain_mask" varchar(255);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "theme_color" varchar(50) DEFAULT '#4F46E5';--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD CONSTRAINT "ai_token_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD CONSTRAINT "ai_token_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_broadcasts" ADD CONSTRAINT "platform_broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_price_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_current_period_end";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "billing_status";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "subscription_tier";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "active_modules";