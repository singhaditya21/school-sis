-- Expand-only PII-at-rest encryption completion (tenants.phone_enc, messages.recipient_phone_enc, messages.recipient_email_enc).
-- Preserves existing plaintext columns as nullable for zero-downtime dual-read and backfill/rotation.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "phone_enc" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "recipient_phone_enc" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "recipient_email_enc" text;
