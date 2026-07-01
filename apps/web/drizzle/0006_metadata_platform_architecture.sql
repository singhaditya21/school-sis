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
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "status" varchar(24) DEFAULT 'PUBLISHED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "published_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "metadata_objects" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD COLUMN IF NOT EXISTS "validation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD COLUMN IF NOT EXISTS "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
UPDATE "metadata_objects"
SET "status" = COALESCE(NULLIF("status", ''), 'PUBLISHED'),
    "version" = GREATEST(COALESCE("version", 1), 1),
    "published_version" = GREATEST(COALESCE("published_version", "version", 1), 1),
    "published_at" = COALESCE("published_at", "created_at", now()),
    "updated_at" = COALESCE("updated_at", "created_at", now());
--> statement-breakpoint
UPDATE "metadata_fields"
SET "status" = COALESCE(NULLIF("status", ''), 'ACTIVE'),
    "version" = GREATEST(COALESCE("version", 1), 1),
    "validation_rules" = COALESCE("validation_rules", '{}'::jsonb),
    "picklist_options" = COALESCE("picklist_options", '[]'::jsonb),
    "updated_at" = COALESCE("updated_at", "created_at", now());
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_objects_status_check'
    ) THEN
        ALTER TABLE "metadata_objects"
            ADD CONSTRAINT "metadata_objects_status_check"
            CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_fields_status_check'
    ) THEN
        ALTER TABLE "metadata_fields"
            ADD CONSTRAINT "metadata_fields_status_check"
            CHECK ("status" IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_fields_data_type_check'
    ) THEN
        ALTER TABLE "metadata_fields"
            ADD CONSTRAINT "metadata_fields_data_type_check"
            CHECK ("data_type" IN ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'PICKLIST', 'CURRENCY'));
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "metadata_objects"
        WHERE "tenant_id" IS NOT NULL
        GROUP BY "tenant_id", "api_name"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate tenant metadata objects must be resolved before adding metadata_objects_tenant_id_api_name_key.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_objects_tenant_id_api_name_key'
    ) THEN
        ALTER TABLE "metadata_objects"
            ADD CONSTRAINT "metadata_objects_tenant_id_api_name_key"
            UNIQUE ("tenant_id", "api_name");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_fields_object_id_api_name_key'
    ) THEN
        ALTER TABLE "metadata_fields"
            ADD CONSTRAINT "metadata_fields_object_id_api_name_key"
            UNIQUE ("object_id", "api_name");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'field_permissions_field_id_role_key'
    ) THEN
        ALTER TABLE "field_permissions"
            ADD CONSTRAINT "field_permissions_field_id_role_key"
            UNIQUE ("field_id", "role");
    END IF;
END $$;
--> statement-breakpoint
WITH ranked AS (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "api_name" ORDER BY "created_at" ASC, "id" ASC) AS rn
    FROM "metadata_objects"
    WHERE "tenant_id" IS NULL
      AND "status" <> 'ARCHIVED'
)
UPDATE "metadata_objects"
SET "status" = 'ARCHIVED',
    "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_metadata_objects_system_api_name"
    ON "metadata_objects" USING btree ("api_name")
    WHERE "tenant_id" IS NULL AND "status" <> 'ARCHIVED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_objects_tenant_status"
    ON "metadata_objects" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_fields_object_status"
    ON "metadata_fields" USING btree ("object_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_records_tenant_object"
    ON "metadata_records" USING btree ("tenant_id", "object_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_schema_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "object_id" uuid NOT NULL REFERENCES "public"."metadata_objects"("id") ON DELETE cascade,
    "version" integer NOT NULL,
    "status" varchar(24) DEFAULT 'PUBLISHED' NOT NULL,
    "schema_snapshot" jsonb NOT NULL,
    "migration_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "published_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_migration_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "object_id" uuid NOT NULL REFERENCES "public"."metadata_objects"("id") ON DELETE cascade,
    "schema_version_id" uuid REFERENCES "public"."metadata_schema_versions"("id") ON DELETE set null,
    "operation" varchar(64) NOT NULL,
    "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "error" text,
    "requested_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_schema_versions_object_id_version_key'
    ) THEN
        ALTER TABLE "metadata_schema_versions"
            ADD CONSTRAINT "metadata_schema_versions_object_id_version_key"
            UNIQUE ("object_id", "version");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_schema_versions_status_check'
    ) THEN
        ALTER TABLE "metadata_schema_versions"
            ADD CONSTRAINT "metadata_schema_versions_status_check"
            CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'metadata_migration_jobs_status_check'
    ) THEN
        ALTER TABLE "metadata_migration_jobs"
            ADD CONSTRAINT "metadata_migration_jobs_status_check"
            CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_schema_versions_tenant_object_status"
    ON "metadata_schema_versions" USING btree ("tenant_id", "object_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_migration_jobs_tenant_status"
    ON "metadata_migration_jobs" USING btree ("tenant_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_migration_jobs_object"
    ON "metadata_migration_jobs" USING btree ("object_id");
--> statement-breakpoint
INSERT INTO "metadata_schema_versions" (
    "tenant_id", "object_id", "version", "status", "schema_snapshot", "migration_plan", "published_at"
)
SELECT mo."tenant_id",
       mo."id",
       GREATEST(COALESCE(mo."published_version", mo."version", 1), 1),
       'PUBLISHED',
       jsonb_build_object(
           'object', to_jsonb(mo),
           'fields', COALESCE((
               SELECT jsonb_agg(to_jsonb(mf) ORDER BY mf."created_at" ASC)
               FROM "metadata_fields" mf
               WHERE mf."object_id" = mo."id"
                 AND mf."status" <> 'ARCHIVED'
           ), '[]'::jsonb)
       ),
       jsonb_build_object('operation', 'BASELINE_SNAPSHOT', 'physicalDdlRequired', false),
       COALESCE(mo."published_at", mo."created_at", now())
FROM "metadata_objects" mo
WHERE mo."status" = 'PUBLISHED'
ON CONFLICT ("object_id", "version") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "metadata_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "metadata_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "metadata_records";
--> statement-breakpoint
DROP POLICY IF EXISTS metadata_records_tenant_isolation_policy ON "metadata_records";
--> statement-breakpoint
CREATE POLICY metadata_records_tenant_isolation_policy ON "metadata_records"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "metadata_schema_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "metadata_schema_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS metadata_schema_versions_tenant_select ON "metadata_schema_versions";
--> statement-breakpoint
DROP POLICY IF EXISTS metadata_schema_versions_tenant_insert ON "metadata_schema_versions";
--> statement-breakpoint
DROP POLICY IF EXISTS metadata_schema_versions_tenant_update ON "metadata_schema_versions";
--> statement-breakpoint
DROP POLICY IF EXISTS metadata_schema_versions_tenant_delete ON "metadata_schema_versions";
--> statement-breakpoint
CREATE POLICY metadata_schema_versions_tenant_select ON "metadata_schema_versions"
    FOR SELECT
    USING (
        app_private.rls_bypass()
        OR tenant_id = app_private.current_tenant_id()
        OR (tenant_id IS NULL AND status = 'PUBLISHED')
    );
--> statement-breakpoint
CREATE POLICY metadata_schema_versions_tenant_insert ON "metadata_schema_versions"
    FOR INSERT
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
CREATE POLICY metadata_schema_versions_tenant_update ON "metadata_schema_versions"
    FOR UPDATE
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
CREATE POLICY metadata_schema_versions_tenant_delete ON "metadata_schema_versions"
    FOR DELETE
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "metadata_migration_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "metadata_migration_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "metadata_migration_jobs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "metadata_migration_jobs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'off', false);
