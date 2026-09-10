-- Harden public marketing lead intake with encrypted contact email, explicit consent
-- evidence, source attribution, and durable CRM delivery status.
--
-- EXPAND-ONLY. Existing plaintext remains readable during the rollout; the PII
-- backfill copies it to contact_email_enc and then nulls contact_email.
ALTER TABLE "marketing_leads" ADD COLUMN "contact_email_enc" text;--> statement-breakpoint
ALTER TABLE "marketing_leads" ALTER COLUMN "contact_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "consent_version" varchar(80);--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "consent_ip_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "referrer" text;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "utm_source" varchar(255);--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "utm_medium" varchar(255);--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "utm_campaign" varchar(255);--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "crm_status" varchar(30) DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "crm_last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketing_leads" ADD COLUMN "crm_error" text;--> statement-breakpoint
CREATE INDEX "idx_marketing_leads_crm_status_created" ON "marketing_leads" ("crm_status", "created_at");
