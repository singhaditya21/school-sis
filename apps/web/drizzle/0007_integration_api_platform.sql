CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.rls_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
$$;
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'on', false);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_api_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "name" varchar(120) NOT NULL,
    "provider" varchar(40) DEFAULT 'PLATFORM' NOT NULL,
    "key_prefix" varchar(32) NOT NULL,
    "key_hash" varchar(128) NOT NULL,
    "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "expires_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "revoked_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_connections" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "provider" varchar(40) NOT NULL,
    "mode" varchar(20) DEFAULT 'MOCK' NOT NULL,
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "last_error" text,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_audit_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "provider" varchar(40) NOT NULL,
    "action" varchar(120) NOT NULL,
    "direction" varchar(20) DEFAULT 'INBOUND' NOT NULL,
    "status" varchar(20) NOT NULL,
    "api_key_id" uuid REFERENCES "public"."integration_api_keys"("id") ON DELETE set null,
    "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "request_id" varchar(80),
    "idempotency_key" varchar(120),
    "http_method" varchar(12),
    "path" text,
    "status_code" integer,
    "duration_ms" integer,
    "ip_address" varchar(64),
    "user_agent" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_api_keys_key_hash_key') THEN
        ALTER TABLE "integration_api_keys"
            ADD CONSTRAINT "integration_api_keys_key_hash_key" UNIQUE ("key_hash");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_tenant_provider_key') THEN
        ALTER TABLE "integration_connections"
            ADD CONSTRAINT "integration_connections_tenant_provider_key" UNIQUE ("tenant_id", "provider");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_api_keys_status_check') THEN
        ALTER TABLE "integration_api_keys"
            ADD CONSTRAINT "integration_api_keys_status_check"
            CHECK ("status" IN ('ACTIVE', 'REVOKED', 'EXPIRED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_status_check') THEN
        ALTER TABLE "integration_connections"
            ADD CONSTRAINT "integration_connections_status_check"
            CHECK ("status" IN ('ACTIVE', 'DISABLED', 'ERROR'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_mode_check') THEN
        ALTER TABLE "integration_connections"
            ADD CONSTRAINT "integration_connections_mode_check"
            CHECK ("mode" IN ('MOCK', 'LIVE'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_audit_logs_direction_check') THEN
        ALTER TABLE "integration_audit_logs"
            ADD CONSTRAINT "integration_audit_logs_direction_check"
            CHECK ("direction" IN ('INBOUND', 'OUTBOUND', 'INTERNAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_audit_logs_status_check') THEN
        ALTER TABLE "integration_audit_logs"
            ADD CONSTRAINT "integration_audit_logs_status_check"
            CHECK ("status" IN ('SUCCESS', 'FAILED', 'DENIED', 'QUEUED'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_api_keys_tenant_provider"
    ON "integration_api_keys" USING btree ("tenant_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_api_keys_tenant_status"
    ON "integration_api_keys" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_connections_tenant_status"
    ON "integration_connections" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_audit_tenant_provider_created"
    ON "integration_audit_logs" USING btree ("tenant_id", "provider", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_audit_request"
    ON "integration_audit_logs" USING btree ("request_id");
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
UPDATE "webhook_deliveries" wd
SET "tenant_id" = ws."tenant_id"
FROM "webhook_subscriptions" ws
WHERE wd."subscription_id" = ws."id"
  AND wd."tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_tenant_id_tenants_id_fk') THEN
        ALTER TABLE "webhook_deliveries"
            ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk"
            FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
    END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "event_id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
UPDATE "webhook_deliveries" SET "event_id" = gen_random_uuid() WHERE "event_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "event_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(120);
--> statement-breakpoint
UPDATE "webhook_deliveries"
SET "idempotency_key" = COALESCE("idempotency_key", "event" || ':' || "id"::text)
WHERE "idempotency_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "idempotency_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "request_headers" jsonb;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "signature" varchar(128);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_tenant_created"
    ON "webhook_deliveries" USING btree ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_retry"
    ON "webhook_deliveries" USING btree ("status", "next_retry_at");
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_subscription_id_idempotency_key_key'
    ) THEN
        ALTER TABLE "webhook_deliveries"
            ADD CONSTRAINT "webhook_deliveries_subscription_id_idempotency_key_key"
            UNIQUE ("subscription_id", "idempotency_key");
    END IF;
END $$;
--> statement-breakpoint
INSERT INTO "integration_connections" ("tenant_id", "provider", "mode", "status", "config", "scopes")
SELECT t."id",
       provider.provider,
       'MOCK',
       'ACTIVE',
       jsonb_build_object('mock', true, 'seededAt', now()),
       provider.scopes
FROM "tenants" t
CROSS JOIN (
    VALUES
        ('ONEROSTER', '["oneroster:read"]'::jsonb),
        ('SCIM', '["scim:read","scim:write"]'::jsonb),
        ('TALLY', '["tally:export"]'::jsonb),
        ('LTI', '["lti:launch"]'::jsonb),
        ('WEBHOOKS', '["webhooks:manage","webhooks:deliver"]'::jsonb)
) AS provider(provider, scopes)
ON CONFLICT ("tenant_id", "provider") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "integration_api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_api_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "integration_api_keys";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "integration_api_keys"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "integration_connections";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "integration_connections"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "integration_audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "integration_audit_logs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "integration_audit_logs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation_policy ON "webhook_deliveries";
--> statement-breakpoint
CREATE POLICY webhook_deliveries_tenant_isolation_policy ON "webhook_deliveries"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'off', false);
