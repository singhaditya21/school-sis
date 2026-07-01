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
CREATE TABLE IF NOT EXISTS "observability_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'PLATFORM' NOT NULL,
    "severity" varchar(20) DEFAULT 'INFO' NOT NULL,
    "source" varchar(120) NOT NULL,
    "event_type" varchar(120) NOT NULL,
    "message" text NOT NULL,
    "request_id" varchar(120),
    "trace_id" varchar(120),
    "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "entity_type" varchar(80),
    "entity_id" varchar(120),
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sre_incidents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'PLATFORM' NOT NULL,
    "severity" varchar(20) DEFAULT 'WARNING' NOT NULL,
    "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
    "source" varchar(120) NOT NULL,
    "fingerprint" varchar(160) NOT NULL,
    "title" varchar(240) NOT NULL,
    "description" text,
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
    "acknowledged_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "acknowledged_at" timestamp with time zone,
    "resolved_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "resolved_at" timestamp with time zone,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slo_definitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'PLATFORM' NOT NULL,
    "service" varchar(120) NOT NULL,
    "name" varchar(160) NOT NULL,
    "indicator" varchar(80) NOT NULL,
    "target_bps" integer NOT NULL,
    "window" varchar(40) DEFAULT '30d' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slo_measurements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "slo_id" uuid NOT NULL REFERENCES "public"."slo_definitions"("id") ON DELETE cascade,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "service" varchar(120) NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "window_end" timestamp with time zone NOT NULL,
    "good_events" integer DEFAULT 0 NOT NULL,
    "total_events" integer DEFAULT 0 NOT NULL,
    "value_bps" numeric(8,2) DEFAULT '0' NOT NULL,
    "status" varchar(20) DEFAULT 'UNKNOWN' NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observability_events_scope_check') THEN
        ALTER TABLE "observability_events"
            ADD CONSTRAINT "observability_events_scope_check"
            CHECK ("scope" IN ('TENANT', 'PLATFORM'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observability_events_scope_tenant_check') THEN
        ALTER TABLE "observability_events"
            ADD CONSTRAINT "observability_events_scope_tenant_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observability_events_severity_check') THEN
        ALTER TABLE "observability_events"
            ADD CONSTRAINT "observability_events_severity_check"
            CHECK ("severity" IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sre_incidents_scope_check') THEN
        ALTER TABLE "sre_incidents"
            ADD CONSTRAINT "sre_incidents_scope_check"
            CHECK ("scope" IN ('TENANT', 'PLATFORM'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sre_incidents_scope_tenant_check') THEN
        ALTER TABLE "sre_incidents"
            ADD CONSTRAINT "sre_incidents_scope_tenant_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sre_incidents_severity_check') THEN
        ALTER TABLE "sre_incidents"
            ADD CONSTRAINT "sre_incidents_severity_check"
            CHECK ("severity" IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sre_incidents_status_check') THEN
        ALTER TABLE "sre_incidents"
            ADD CONSTRAINT "sre_incidents_status_check"
            CHECK ("status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sre_incidents_occurrence_count_check') THEN
        ALTER TABLE "sre_incidents"
            ADD CONSTRAINT "sre_incidents_occurrence_count_check"
            CHECK ("occurrence_count" > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slo_definitions_scope_check') THEN
        ALTER TABLE "slo_definitions"
            ADD CONSTRAINT "slo_definitions_scope_check"
            CHECK ("scope" IN ('TENANT', 'PLATFORM'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slo_definitions_scope_tenant_check') THEN
        ALTER TABLE "slo_definitions"
            ADD CONSTRAINT "slo_definitions_scope_tenant_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slo_definitions_target_check') THEN
        ALTER TABLE "slo_definitions"
            ADD CONSTRAINT "slo_definitions_target_check"
            CHECK ("target_bps" > 0 AND "target_bps" <= 10000);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slo_measurements_counts_check') THEN
        ALTER TABLE "slo_measurements"
            ADD CONSTRAINT "slo_measurements_counts_check"
            CHECK ("good_events" >= 0 AND "total_events" >= 0 AND "good_events" <= "total_events");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slo_measurements_status_check') THEN
        ALTER TABLE "slo_measurements"
            ADD CONSTRAINT "slo_measurements_status_check"
            CHECK ("status" IN ('HEALTHY', 'BREACHING', 'BREACHED', 'UNKNOWN'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_observability_events_tenant_severity_created"
    ON "observability_events" USING btree ("tenant_id", "severity", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_observability_events_source_type_created"
    ON "observability_events" USING btree ("source", "event_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_observability_events_request"
    ON "observability_events" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sre_incidents_tenant_status_severity"
    ON "sre_incidents" USING btree ("tenant_id", "status", "severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sre_incidents_last_seen"
    ON "sre_incidents" USING btree ("last_seen_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sre_incidents_tenant_fingerprint_key"
    ON "sre_incidents" USING btree ("tenant_id", "fingerprint")
    WHERE "tenant_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sre_incidents_platform_fingerprint_key"
    ON "sre_incidents" USING btree ("fingerprint")
    WHERE "tenant_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slo_definitions_service_active"
    ON "slo_definitions" USING btree ("service", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slo_definitions_tenant_service"
    ON "slo_definitions" USING btree ("tenant_id", "service");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slo_measurements_slo_window"
    ON "slo_measurements" USING btree ("slo_id", "window_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slo_measurements_tenant_service_window"
    ON "slo_measurements" USING btree ("tenant_id", "service", "window_end");
--> statement-breakpoint
INSERT INTO "slo_definitions" ("scope", "service", "name", "indicator", "target_bps", "window", "metadata")
VALUES
    ('PLATFORM', 'web', 'Web availability', 'availability', 9950, '30d', '{"source":"synthetic_or_edge"}'::jsonb),
    ('PLATFORM', 'jobs', 'Background job success', 'success_rate', 9900, '7d', '{"source":"background_jobs"}'::jsonb),
    ('PLATFORM', 'notifications', 'Notification outbox success', 'success_rate', 9850, '7d', '{"source":"notification_outbox"}'::jsonb),
    ('PLATFORM', 'database', 'Database readiness', 'availability', 9990, '30d', '{"source":"readiness_probe"}'::jsonb)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "observability_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "observability_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "observability_events";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "observability_events"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "sre_incidents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sre_incidents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "sre_incidents";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "sre_incidents"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "slo_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "slo_definitions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "slo_definitions";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "slo_definitions"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "slo_measurements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "slo_measurements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "slo_measurements";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "slo_measurements"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'off', false);
