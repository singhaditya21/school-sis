-- Expand-only security hardening migration (CRIT-01, CRIT-03, HIGH-03, HIGH-05, HIGH-11, MED-02, MED-10).
-- Adds session revocation counters, demo-tenant markers, payment ledger uniqueness locks,
-- encrypted PII columns, WhatsApp channel lookup index, and HQ boundary enforcement trigger.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_enc" text;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "email_enc" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "pending_checkout_meta" jsonb;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(160);
--> statement-breakpoint
ALTER TABLE "admission_leads" ADD COLUMN IF NOT EXISTS "parent_email_enc" text;
--> statement-breakpoint
ALTER TABLE "admission_leads" ALTER COLUMN "parent_email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "admission_leads" ADD COLUMN IF NOT EXISTS "parent_phone_enc" text;
--> statement-breakpoint
ALTER TABLE "admission_leads" ALTER COLUMN "parent_phone" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "pan_number_enc" text;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "bank_account_enc" text;
--> statement-breakpoint
UPDATE "tenants"
SET "is_demo" = true
WHERE "code" IN ('DEMO-CAMPUS', 'DEMO-CAMPUS-SOUTH')
  AND "is_demo" = false;
--> statement-breakpoint
DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('tenant %s / tx %s (%s rows)', tenant_id, transaction_id, n), '; ')
    INTO conflicts
    FROM (
        SELECT tenant_id, transaction_id, count(*) AS n
        FROM payments
        WHERE transaction_id IS NOT NULL AND method = 'ONLINE'
        GROUP BY 1, 2
        HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on payments(tenant_id, transaction_id) for ONLINE payments: %', conflicts;
    END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_tenant_online_tx"
    ON "payments" ("tenant_id", "transaction_id")
    WHERE "transaction_id" IS NOT NULL AND "method" = 'ONLINE';
--> statement-breakpoint
DO $$
DECLARE conflicts text;
BEGIN
    SELECT string_agg(format('razorpay_payment_id %s (%s rows)', razorpay_payment_id, n), '; ')
    INTO conflicts
    FROM (
        SELECT razorpay_payment_id, count(*) AS n
        FROM payments
        WHERE razorpay_payment_id IS NOT NULL
        GROUP BY 1
        HAVING count(*) > 1
    ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add unique index on payments(razorpay_payment_id): %', conflicts;
    END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_razorpay_payment_id"
    ON "payments" ("razorpay_payment_id")
    WHERE "razorpay_payment_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_tenant_idempotency_key"
    ON "payments" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_connections_whatsapp_channel"
    ON "integration_connections" (("config"->>'phoneNumberId'))
    WHERE "provider" = 'WHATSAPP' AND "status" = 'ACTIVE';
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.enforce_platform_admin_workspace_boundary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    workspace_code text;
    normalized_email text;
    local_part text;
    domain_part text;
BEGIN
    IF NEW.role = 'PLATFORM_ADMIN' THEN
        SELECT upper(t.code)
        INTO workspace_code
        FROM public.tenants t
        WHERE t.id = NEW.tenant_id;

        IF workspace_code IS DISTINCT FROM 'HQ' THEN
            RAISE EXCEPTION 'PLATFORM_ADMIN accounts may only belong to the HQ workspace.';
        END IF;
    END IF;

    IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
        normalized_email := lower(btrim(NEW.email));
        IF position('@' IN normalized_email) > 1 THEN
            local_part := split_part(normalized_email, '@', 1);
            domain_part := split_part(normalized_email, '@', 2);
            IF domain_part IN ('gmail.com', 'googlemail.com') THEN
                local_part := replace(split_part(local_part, '+', 1), '.', '');
                domain_part := 'gmail.com';
                normalized_email := local_part || '@' || domain_part;
            END IF;
        END IF;

        IF normalized_email = 'singhaditya21@gmail.com' THEN
            IF workspace_code IS NULL THEN
                SELECT upper(t.code)
                INTO workspace_code
                FROM public.tenants t
                WHERE t.id = NEW.tenant_id;
            END IF;

            IF workspace_code IS DISTINCT FROM 'HQ' THEN
                RAISE EXCEPTION 'Permanent platform owner email is reserved exclusively for the HQ workspace.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger tg
        JOIN pg_catalog.pg_class cls ON cls.oid = tg.tgrelid
        JOIN pg_catalog.pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = 'users'
          AND tg.tgname = 'trg_users_platform_admin_hq_only'
          AND NOT tg.tgisinternal
    ) THEN
        CREATE TRIGGER trg_users_platform_admin_hq_only
            BEFORE INSERT OR UPDATE ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION app_private.enforce_platform_admin_workspace_boundary();
    END IF;
END $$;
