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
CREATE TABLE IF NOT EXISTS "operator_console_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "status" varchar(20) DEFAULT 'HEALTHY' NOT NULL,
    "health_score" integer DEFAULT 100 NOT NULL,
    "generated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operator_console_runbooks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'PLATFORM' NOT NULL,
    "code" varchar(160) NOT NULL,
    "domain" varchar(60) NOT NULL,
    "title" varchar(240) NOT NULL,
    "severity" varchar(20) DEFAULT 'WARNING' NOT NULL,
    "owner_role" varchar(80) NOT NULL,
    "summary" text NOT NULL,
    "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "escalation" text,
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operator_console_action_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "domain" varchar(60) NOT NULL,
    "action_type" varchar(80) NOT NULL,
    "audit_action" varchar(160) NOT NULL,
    "target_type" varchar(80),
    "target_id" varchar(160),
    "idempotency_key" varchar(160),
    "status" varchar(30) DEFAULT 'REQUESTED' NOT NULL,
    "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "actor_role" varchar(80) NOT NULL,
    "reason" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_snapshots_scope_check') THEN
        ALTER TABLE "operator_console_snapshots"
            ADD CONSTRAINT "operator_console_snapshots_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_snapshots_status_check') THEN
        ALTER TABLE "operator_console_snapshots"
            ADD CONSTRAINT "operator_console_snapshots_status_check"
            CHECK ("status" IN ('HEALTHY', 'INFO', 'WARNING', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_snapshots_score_check') THEN
        ALTER TABLE "operator_console_snapshots"
            ADD CONSTRAINT "operator_console_snapshots_score_check"
            CHECK ("health_score" >= 0 AND "health_score" <= 100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_runbooks_scope_check') THEN
        ALTER TABLE "operator_console_runbooks"
            ADD CONSTRAINT "operator_console_runbooks_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_runbooks_severity_check') THEN
        ALTER TABLE "operator_console_runbooks"
            ADD CONSTRAINT "operator_console_runbooks_severity_check"
            CHECK ("severity" IN ('HEALTHY', 'INFO', 'WARNING', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_runbooks_status_check') THEN
        ALTER TABLE "operator_console_runbooks"
            ADD CONSTRAINT "operator_console_runbooks_status_check"
            CHECK ("status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_runbooks_version_check') THEN
        ALTER TABLE "operator_console_runbooks"
            ADD CONSTRAINT "operator_console_runbooks_version_check"
            CHECK ("version" > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_actions_scope_check') THEN
        ALTER TABLE "operator_console_action_logs"
            ADD CONSTRAINT "operator_console_actions_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_actions_status_check') THEN
        ALTER TABLE "operator_console_action_logs"
            ADD CONSTRAINT "operator_console_actions_status_check"
            CHECK ("status" IN ('REQUESTED', 'APPROVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_snapshots_tenant_generated"
    ON "operator_console_snapshots" USING btree ("tenant_id", "generated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_snapshots_scope_status"
    ON "operator_console_snapshots" USING btree ("scope", "status", "generated_at");
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_console_runbooks_code_key') THEN
        ALTER TABLE "operator_console_runbooks"
            ADD CONSTRAINT "operator_console_runbooks_code_key" UNIQUE ("code");
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_runbooks_tenant_domain"
    ON "operator_console_runbooks" USING btree ("tenant_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_runbooks_status"
    ON "operator_console_runbooks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_actions_tenant_action_created"
    ON "operator_console_action_logs" USING btree ("tenant_id", "action_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_actions_status"
    ON "operator_console_action_logs" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_actions_target"
    ON "operator_console_action_logs" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operator_actions_tenant_idempotency_key"
    ON "operator_console_action_logs" USING btree ("tenant_id", "idempotency_key")
    WHERE "tenant_id" IS NOT NULL AND "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operator_actions_platform_idempotency_key"
    ON "operator_console_action_logs" USING btree ("idempotency_key")
    WHERE "tenant_id" IS NULL AND "idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "operator_console_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operator_console_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "operator_console_snapshots";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "operator_console_snapshots"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "operator_console_runbooks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operator_console_runbooks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "operator_console_runbooks";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "operator_console_runbooks"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id IS NULL OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "operator_console_action_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operator_console_action_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "operator_console_action_logs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "operator_console_action_logs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
