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
CREATE TABLE IF NOT EXISTS "bi_datasets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "dataset_key" varchar(160) NOT NULL,
    "domain" varchar(60) NOT NULL,
    "label" varchar(240) NOT NULL,
    "description" text NOT NULL,
    "grain" varchar(80) NOT NULL,
    "source_tables" text[] DEFAULT '{}'::text[] NOT NULL,
    "tenant_column" varchar(160),
    "default_date_field" varchar(160),
    "refresh_strategy" varchar(40) DEFAULT 'LIVE_QUERY' NOT NULL,
    "dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "metric_ids" text[] DEFAULT '{}'::text[] NOT NULL,
    "required_permission" varchar(120) NOT NULL,
    "required_scope" varchar(40) DEFAULT 'tenant' NOT NULL,
    "classifications" text[] DEFAULT '{}'::text[] NOT NULL,
    "exportable" boolean DEFAULT false NOT NULL,
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bi_dashboards" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "dashboard_key" varchar(160) NOT NULL,
    "domain" varchar(60) NOT NULL,
    "title" varchar(240) NOT NULL,
    "description" text NOT NULL,
    "route" varchar(240) NOT NULL,
    "persona_roles" text[] DEFAULT '{}'::text[] NOT NULL,
    "required_permission" varchar(120) NOT NULL,
    "required_scope" varchar(40) DEFAULT 'tenant' NOT NULL,
    "default_filters" text[] DEFAULT '{}'::text[] NOT NULL,
    "tiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bi_report_definitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "name" varchar(240) NOT NULL,
    "dataset_key" varchar(160) NOT NULL,
    "selected_metrics" text[] DEFAULT '{}'::text[] NOT NULL,
    "selected_dimensions" text[] DEFAULT '{}'::text[] NOT NULL,
    "filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "date_range" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "export_policy_id" varchar(160),
    "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bi_report_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "report_definition_id" uuid REFERENCES "public"."bi_report_definitions"("id") ON DELETE set null,
    "dataset_key" varchar(160) NOT NULL,
    "status" varchar(30) DEFAULT 'QUEUED' NOT NULL,
    "requested_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "row_count" integer DEFAULT 0 NOT NULL,
    "export_object_key" text,
    "error" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "queued_at" timestamp with time zone DEFAULT now() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bi_metric_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "metric_key" varchar(160) NOT NULL,
    "dataset_key" varchar(160) NOT NULL,
    "grain" varchar(80) NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "value" numeric(18, 4) DEFAULT '0' NOT NULL,
    "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "source_run_id" uuid REFERENCES "public"."bi_report_runs"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_datasets_scope_check') THEN
        ALTER TABLE "bi_datasets"
            ADD CONSTRAINT "bi_datasets_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_dashboards_scope_check') THEN
        ALTER TABLE "bi_dashboards"
            ADD CONSTRAINT "bi_dashboards_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_report_definitions_scope_check') THEN
        ALTER TABLE "bi_report_definitions"
            ADD CONSTRAINT "bi_report_definitions_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_report_runs_scope_check') THEN
        ALTER TABLE "bi_report_runs"
            ADD CONSTRAINT "bi_report_runs_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_metric_snapshots_scope_check') THEN
        ALTER TABLE "bi_metric_snapshots"
            ADD CONSTRAINT "bi_metric_snapshots_scope_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_dataset_status_check') THEN
        ALTER TABLE "bi_datasets"
            ADD CONSTRAINT "bi_dataset_status_check"
            CHECK ("status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_dashboard_status_check') THEN
        ALTER TABLE "bi_dashboards"
            ADD CONSTRAINT "bi_dashboard_status_check"
            CHECK ("status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_report_definition_status_check') THEN
        ALTER TABLE "bi_report_definitions"
            ADD CONSTRAINT "bi_report_definition_status_check"
            CHECK ("status" IN ('ACTIVE', 'PAUSED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_report_run_status_check') THEN
        ALTER TABLE "bi_report_runs"
            ADD CONSTRAINT "bi_report_run_status_check"
            CHECK ("status" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_version_check') THEN
        ALTER TABLE "bi_datasets"
            ADD CONSTRAINT "bi_version_check" CHECK ("version" > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_dashboard_version_check') THEN
        ALTER TABLE "bi_dashboards"
            ADD CONSTRAINT "bi_dashboard_version_check" CHECK ("version" > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bi_metric_snapshot_period_check') THEN
        ALTER TABLE "bi_metric_snapshots"
            ADD CONSTRAINT "bi_metric_snapshot_period_check" CHECK ("period_end" >= "period_start");
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_datasets_tenant_domain"
    ON "bi_datasets" USING btree ("tenant_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_datasets_status"
    ON "bi_datasets" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bi_datasets_tenant_dataset_key"
    ON "bi_datasets" USING btree ("tenant_id", "dataset_key")
    WHERE "tenant_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bi_datasets_platform_dataset_key"
    ON "bi_datasets" USING btree ("dataset_key")
    WHERE "tenant_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_dashboards_tenant_domain"
    ON "bi_dashboards" USING btree ("tenant_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_dashboards_status"
    ON "bi_dashboards" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bi_dashboards_tenant_dashboard_key"
    ON "bi_dashboards" USING btree ("tenant_id", "dashboard_key")
    WHERE "tenant_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bi_dashboards_platform_dashboard_key"
    ON "bi_dashboards" USING btree ("dashboard_key")
    WHERE "tenant_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_report_defs_tenant_dataset"
    ON "bi_report_definitions" USING btree ("tenant_id", "dataset_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_report_defs_tenant_status"
    ON "bi_report_definitions" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_report_runs_tenant_status_queued"
    ON "bi_report_runs" USING btree ("tenant_id", "status", "queued_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_report_runs_definition"
    ON "bi_report_runs" USING btree ("report_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_metric_snapshots_tenant_metric_period"
    ON "bi_metric_snapshots" USING btree ("tenant_id", "metric_key", "period_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bi_metric_snapshots_dataset_period"
    ON "bi_metric_snapshots" USING btree ("dataset_key", "period_end");
--> statement-breakpoint
ALTER TABLE "bi_datasets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bi_datasets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "bi_datasets";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "bi_datasets"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id IS NULL OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "bi_dashboards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bi_dashboards" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "bi_dashboards";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "bi_dashboards"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id IS NULL OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "bi_report_definitions";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "bi_report_definitions"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "bi_report_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bi_report_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "bi_report_runs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "bi_report_runs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "bi_metric_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bi_metric_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "bi_metric_snapshots";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "bi_metric_snapshots"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
