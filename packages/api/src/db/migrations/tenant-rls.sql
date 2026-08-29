-- The deployment and standalone RLS runners own the transaction boundary.
-- Keep this file free of BEGIN/COMMIT so schema, ledger, RLS, and grants share one commit.
SET LOCAL app.bypass_rls = 'on';
SET LOCAL app.current_tenant = '';
SET LOCAL app.tenant_context_key_id = '';
SET LOCAL app.tenant_context_audience = '';
SET LOCAL app.tenant_context_expires_at = '';
SET LOCAL app.tenant_context_nonce = '';
SET LOCAL app.tenant_context_signature = '';
SET LOCAL app.current_owner = '';
SET LOCAL app.current_group = '';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.tenant_context_signing_keys (
    key_id text PRIMARY KEY,
    audience text NOT NULL,
    secret bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT tenant_context_signing_keys_key_id_format
        CHECK (key_id ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
    CONSTRAINT tenant_context_signing_keys_audience_format
        CHECK (audience ~ '^[a-z0-9][a-z0-9:._-]{2,191}$'),
    CONSTRAINT tenant_context_signing_keys_secret_length
        CHECK (octet_length(secret) BETWEEN 32 AND 128)
);

REVOKE ALL ON TABLE app_private.tenant_context_signing_keys FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_private.tenant_context_rollout_state (
    singleton boolean PRIMARY KEY DEFAULT true,
    enforcement_phase smallint NOT NULL DEFAULT 1,
    signed_runtime_sha text,
    promoted_key_id text,
    promoted_audience text,
    promoted_deployment_id text,
    promoted_at timestamptz,
    temp_revoked_at timestamptz,
    temp_drain_completed_at timestamptz,
    CONSTRAINT tenant_context_rollout_state_singleton CHECK (singleton),
    CONSTRAINT tenant_context_rollout_state_phase CHECK (enforcement_phase IN (1, 2)),
    CONSTRAINT tenant_context_rollout_state_sha
        CHECK (signed_runtime_sha IS NULL OR signed_runtime_sha ~ '^[0-9a-f]{40}$'),
    CONSTRAINT tenant_context_rollout_state_key_id
        CHECK (promoted_key_id IS NULL OR promoted_key_id ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
    CONSTRAINT tenant_context_rollout_state_audience
        CHECK (promoted_audience IS NULL OR promoted_audience ~ '^[a-z0-9][a-z0-9:._-]{2,191}$'),
    CONSTRAINT tenant_context_rollout_state_deployment_id
        CHECK (promoted_deployment_id IS NULL OR promoted_deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
    CONSTRAINT tenant_context_rollout_state_temp_drain_order CHECK (
        temp_drain_completed_at IS NULL OR temp_revoked_at IS NOT NULL
    ),
    CONSTRAINT tenant_context_rollout_state_promotion_complete CHECK (
        (signed_runtime_sha IS NULL AND promoted_key_id IS NULL
            AND promoted_audience IS NULL AND promoted_deployment_id IS NULL
            AND promoted_at IS NULL)
        OR
        (signed_runtime_sha IS NOT NULL AND promoted_key_id IS NOT NULL
            AND promoted_audience IS NOT NULL AND promoted_deployment_id IS NOT NULL
            AND promoted_at IS NOT NULL)
    )
);

REVOKE ALL ON TABLE app_private.tenant_context_rollout_state FROM PUBLIC;

-- v2 payload-rollout evidence (recorded in 4b, gated on in 4c). Idempotent so the
-- re-applied RLS file does not fail on an existing column.
ALTER TABLE app_private.tenant_context_rollout_state
    ADD COLUMN IF NOT EXISTS v2_signed_runtime_sha text
        CONSTRAINT tenant_context_rollout_state_v2_sha
        CHECK (v2_signed_runtime_sha IS NULL OR v2_signed_runtime_sha ~ '^[0-9a-f]{40}$');
ALTER TABLE app_private.tenant_context_rollout_state
    ADD COLUMN IF NOT EXISTS v2_promoted_at timestamptz;

CREATE OR REPLACE FUNCTION app_private.constant_time_equal_32(
    left_value bytea,
    right_value bytea
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    difference integer := 0;
    byte_index integer;
BEGIN
    -- Length is public protocol metadata. Once both values are fixed at the
    -- HMAC-SHA-256 width, compare every byte without an early exit.
    IF octet_length(left_value) <> 32 OR octet_length(right_value) <> 32 THEN
        RETURN false;
    END IF;

    FOR byte_index IN 0..31 LOOP
        difference := difference |
            (get_byte(left_value, byte_index) # get_byte(right_value, byte_index));
    END LOOP;
    RETURN difference = 0;
END
$$;

ALTER FUNCTION app_private.constant_time_equal_32(bytea, bytea)
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.verified_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    tenant_text text := NULLIF(current_setting('app.current_tenant', true), '');
    key_id_text text := NULLIF(current_setting('app.tenant_context_key_id', true), '');
    audience_text text := NULLIF(current_setting('app.tenant_context_audience', true), '');
    expires_text text := NULLIF(current_setting('app.tenant_context_expires_at', true), '');
    nonce_text text := NULLIF(current_setting('app.tenant_context_nonce', true), '');
    signature_text text := NULLIF(current_setting('app.tenant_context_signature', true), '');
    -- v2 adds owner + group to the signed payload. A v1 signer sets neither, so
    -- these stay NULL and the v2 branch is skipped — v1 verification unchanged.
    owner_text text := NULLIF(current_setting('app.current_owner', true), '');
    group_text text := NULLIF(current_setting('app.current_group', true), '');
    tenant_value uuid;
    expires_value bigint;
    database_epoch bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
    signing_secret bytea;
    expected_signature bytea;
    provided_signature bytea;
    transaction_text text;
    v2_eligible boolean;
BEGIN
    IF tenant_text IS NULL
       OR tenant_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR key_id_text IS NULL
       OR key_id_text !~ '^[a-z0-9][a-z0-9._-]{0,31}$'
       OR audience_text IS NULL
       OR audience_text !~ '^[a-z0-9][a-z0-9:._-]{2,191}$'
       OR expires_text IS NULL
       OR expires_text !~ '^[0-9]{10}$'
       OR nonce_text IS NULL
       OR nonce_text !~ '^[0-9a-f]{32}$'
       OR signature_text IS NULL
       OR signature_text !~ '^[0-9a-f]{64}$'
    THEN
        RETURN NULL;
    END IF;

    tenant_value := tenant_text::uuid;
    expires_value := expires_text::bigint;

    -- Contexts live for five minutes. Thirty seconds of past skew keeps a
    -- just-issued context stable across ordinary clock drift, while the upper
    -- bound prevents a compromised runtime credential from minting a
    -- practically permanent replay token.
    IF expires_value < database_epoch - 30 OR expires_value > database_epoch + 600 THEN
        RETURN NULL;
    END IF;

    SELECT keys.secret
    INTO signing_secret
    FROM app_private.tenant_context_signing_keys AS keys
    WHERE keys.key_id = key_id_text
      AND keys.audience = audience_text;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    transaction_text := pg_current_xact_id()::text;
    provided_signature := decode(signature_text, 'hex');

    -- v2 first: only when owner AND group are well-formed lowercase UUIDs. A
    -- malformed owner/group must not deny an otherwise-valid v1 context, so on
    -- ineligibility we fall through to v1 rather than returning NULL.
    v2_eligible := owner_text IS NOT NULL
        AND owner_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND group_text IS NOT NULL
        AND group_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    IF v2_eligible THEN
        expected_signature := public.hmac(
            convert_to(
                'school-sis:tenant-context:v2' || E'\n' ||
                audience_text || E'\n' ||
                key_id_text || E'\n' ||
                transaction_text || E'\n' ||
                tenant_value::text || E'\n' ||
                owner_text || E'\n' ||
                group_text || E'\n' ||
                expires_text || E'\n' ||
                nonce_text,
                'UTF8'
            ),
            signing_secret,
            'sha256'
        );
        IF app_private.constant_time_equal_32(expected_signature, provided_signature) THEN
            RETURN tenant_value;
        END IF;
    END IF;

    -- v1 fallback: byte-identical to the original payload (transaction_text is the
    -- same pg_current_xact_id() value, just computed once above).
    expected_signature := public.hmac(
        convert_to(
            'school-sis:tenant-context:v1' || E'\n' ||
            audience_text || E'\n' ||
            key_id_text || E'\n' ||
            transaction_text || E'\n' ||
            tenant_value::text || E'\n' ||
            expires_text || E'\n' ||
            nonce_text,
            'UTF8'
        ),
        signing_secret,
        'sha256'
    );

    IF app_private.constant_time_equal_32(expected_signature, provided_signature) THEN
        RETURN tenant_value;
    END IF;
    RETURN NULL;
EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN NULL;
END
$$;

ALTER FUNCTION app_private.verified_tenant_id()
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    verified_tenant uuid := app_private.verified_tenant_id();
    rollout_phase smallint;
    legacy_tenant text;
BEGIN
    IF verified_tenant IS NOT NULL THEN
        RETURN verified_tenant;
    END IF;

    rollout_phase := app_private.tenant_context_enforcement_phase();

    IF rollout_phase >= 2 OR current_user <> 'school_sis_runtime' THEN
        RETURN NULL;
    END IF;

    -- Phase 1 is deliberately rollback-compatible with the already-live
    -- unsigned application. The release workflow records a successfully
    -- promoted signing runtime before a later reviewed release may atomically
    -- advance the database to phase 2 (strict signatures only).
    legacy_tenant := NULLIF(current_setting('app.current_tenant', true), '');
    IF legacy_tenant IS NULL
       OR legacy_tenant !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
        RETURN NULL;
    END IF;
    RETURN legacy_tenant::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END
$$;

ALTER FUNCTION app_private.current_tenant_id()
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.has_tenant_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_private.current_tenant_id() IS NOT NULL
$$;

ALTER FUNCTION app_private.has_tenant_context()
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.tenant_context_enforcement_phase()
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT state.enforcement_phase
    FROM app_private.tenant_context_rollout_state AS state
    WHERE state.singleton = true
$$;

ALTER FUNCTION app_private.tenant_context_enforcement_phase()
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.rls_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
        AND (
            current_user = 'school_sis_platform'
            OR (
                current_user = 'school_sis_runtime'
                AND app_private.tenant_context_enforcement_phase() = 1
            )
        )
$$;

ALTER FUNCTION app_private.rls_bypass()
    OWNER TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_private.table_exists(table_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT to_regclass('public.' || table_name) IS NOT NULL
$$;

ALTER FUNCTION app_private.table_exists(text)
    OWNER TO CURRENT_USER;

-- Policy DDL takes an ACCESS EXCLUSIVE lock which is retained until the outer
-- deployment transaction commits. Remove every pre-existing policy from the
-- governed public tables before rebuilding the complete reviewed set below;
-- otherwise an extra permissive policy could silently OR itself with RLS.
DO $$
DECLARE
    table_record record;
BEGIN
    FOR table_record IN
        SELECT namespaces.nspname AS schema_name, classes.relname AS table_name
        FROM pg_catalog.pg_class classes
        JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
        WHERE namespaces.nspname = 'public'
          AND classes.relkind IN ('r', 'p')
        ORDER BY namespaces.nspname, classes.relname, classes.oid
    LOOP
        EXECUTE format(
            'LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',
            table_record.schema_name,
            table_record.table_name
        );
    END LOOP;
END $$;

DO $$
DECLARE
    policy_record record;
BEGIN
    FOR policy_record IN
        SELECT namespaces.nspname AS schema_name,
               classes.relname AS table_name,
               policies.polname AS policy_name
        FROM pg_catalog.pg_policy policies
        JOIN pg_catalog.pg_class classes ON classes.oid = policies.polrelid
        JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
        WHERE namespaces.nspname = 'public'
          AND classes.relkind IN ('r', 'p')
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            policy_record.policy_name,
            policy_record.schema_name,
            policy_record.table_name
        );
    END LOOP;
END $$;

DO $$
DECLARE
    table_record record;
BEGIN
    FOR table_record IN
        SELECT c.table_schema, c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.table_schema, table_record.table_name);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', table_record.table_schema, table_record.table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I.%I', table_record.table_schema, table_record.table_name);

        IF table_record.table_name = 'metadata_objects' THEN
            EXECUTE format(
                'CREATE POLICY tenant_isolation_policy ON %I.%I
                 AS PERMISSIVE FOR ALL
                 USING (
                    app_private.rls_bypass()
                    OR tenant_id = (SELECT app_private.current_tenant_id())
                    OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                 )
                 WITH CHECK (
                    app_private.rls_bypass()
                    OR tenant_id = (SELECT app_private.current_tenant_id())
                 )',
                table_record.table_schema,
                table_record.table_name
            );
        ELSE
            EXECUTE format(
                'CREATE POLICY tenant_isolation_policy ON %I.%I
                 AS PERMISSIVE FOR ALL
                 USING (
                    app_private.rls_bypass()
                    OR tenant_id = (SELECT app_private.current_tenant_id())
                 )
                 WITH CHECK (
                    app_private.rls_bypass()
                    OR tenant_id = (SELECT app_private.current_tenant_id())
                 )',
                table_record.table_schema,
                table_record.table_name
            );
        END IF;
    END LOOP;
END $$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_tenant_isolation_select ON public.tenants;
DROP POLICY IF EXISTS tenants_tenant_isolation_insert ON public.tenants;
DROP POLICY IF EXISTS tenants_tenant_isolation_update ON public.tenants;
DROP POLICY IF EXISTS tenants_tenant_isolation_delete ON public.tenants;
CREATE POLICY tenants_tenant_isolation_select ON public.tenants
    FOR SELECT
    USING (app_private.rls_bypass() OR id = (SELECT app_private.current_tenant_id()));
CREATE POLICY tenants_tenant_isolation_insert ON public.tenants
    FOR INSERT
    WITH CHECK (app_private.rls_bypass() OR id = (SELECT app_private.current_tenant_id()));
CREATE POLICY tenants_tenant_isolation_update ON public.tenants
    FOR UPDATE
    USING (app_private.rls_bypass() OR id = (SELECT app_private.current_tenant_id()))
    WITH CHECK (app_private.rls_bypass() OR id = (SELECT app_private.current_tenant_id()));
CREATE POLICY tenants_tenant_isolation_delete ON public.tenants
    FOR DELETE
    USING (app_private.rls_bypass());

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_tenant_isolation_select ON public.companies;
DROP POLICY IF EXISTS companies_tenant_isolation_insert ON public.companies;
DROP POLICY IF EXISTS companies_tenant_isolation_update ON public.companies;
DROP POLICY IF EXISTS companies_tenant_isolation_delete ON public.companies;
CREATE POLICY companies_tenant_isolation_select ON public.companies
    FOR SELECT
    USING (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.tenants t
            WHERE t.company_id = companies.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    );
CREATE POLICY companies_tenant_isolation_insert ON public.companies
    FOR INSERT
    WITH CHECK (app_private.rls_bypass());
CREATE POLICY companies_tenant_isolation_update ON public.companies
    FOR UPDATE
    USING (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.tenants t
            WHERE t.company_id = companies.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    )
    WITH CHECK (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.tenants t
            WHERE t.company_id = companies.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    );
CREATE POLICY companies_tenant_isolation_delete ON public.companies
    FOR DELETE
    USING (app_private.rls_bypass());

-- owners is the top tier (parent of companies, grandparent of tenants). It has
-- no tenant_id, so the discovery loop never reaches it; like companies it gets
-- an explicit parent-scoped policy — visible only via a descendant tenant that
-- is the current session's tenant (owner → company → tenant chain).
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owners_tenant_isolation_select ON public.owners;
DROP POLICY IF EXISTS owners_tenant_isolation_insert ON public.owners;
DROP POLICY IF EXISTS owners_tenant_isolation_update ON public.owners;
DROP POLICY IF EXISTS owners_tenant_isolation_delete ON public.owners;
CREATE POLICY owners_tenant_isolation_select ON public.owners
    FOR SELECT
    USING (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.companies c
            JOIN public.tenants t ON t.company_id = c.id
            WHERE c.owner_id = owners.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    );
CREATE POLICY owners_tenant_isolation_insert ON public.owners
    FOR INSERT
    WITH CHECK (app_private.rls_bypass());
CREATE POLICY owners_tenant_isolation_update ON public.owners
    FOR UPDATE
    USING (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.companies c
            JOIN public.tenants t ON t.company_id = c.id
            WHERE c.owner_id = owners.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    )
    WITH CHECK (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.companies c
            JOIN public.tenants t ON t.company_id = c.id
            WHERE c.owner_id = owners.id
              AND t.id = (SELECT app_private.current_tenant_id())
        )
    );
CREATE POLICY owners_tenant_isolation_delete ON public.owners
    FOR DELETE
    USING (app_private.rls_bypass());

DO $$
BEGIN
    IF app_private.table_exists('grade_subjects') THEN
        ALTER TABLE public.grade_subjects ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.grade_subjects FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS grade_subjects_tenant_isolation_policy ON public.grade_subjects;
        CREATE POLICY grade_subjects_tenant_isolation_policy ON public.grade_subjects
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grades g
                    JOIN public.subjects s ON s.id = grade_subjects.subject_id
                    WHERE g.id = grade_subjects.grade_id
                      AND g.tenant_id = (SELECT app_private.current_tenant_id())
                      AND s.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grades g
                    JOIN public.subjects s ON s.id = grade_subjects.subject_id
                    WHERE g.id = grade_subjects.grade_id
                      AND g.tenant_id = (SELECT app_private.current_tenant_id())
                      AND s.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('fee_components') THEN
        ALTER TABLE public.fee_components ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.fee_components FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS fee_components_tenant_isolation_policy ON public.fee_components;
        CREATE POLICY fee_components_tenant_isolation_policy ON public.fee_components
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.fee_plans fp
                    WHERE fp.id = fee_components.fee_plan_id
                      AND fp.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.fee_plans fp
                    WHERE fp.id = fee_components.fee_plan_id
                      AND fp.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('exam_schedules') THEN
        ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.exam_schedules FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS exam_schedules_tenant_isolation_policy ON public.exam_schedules;
        CREATE POLICY exam_schedules_tenant_isolation_policy ON public.exam_schedules
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.exams e
                    WHERE e.id = exam_schedules.exam_id
                      AND e.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.exams e
                    WHERE e.id = exam_schedules.exam_id
                      AND e.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('stops') THEN
        ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.stops FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS stops_tenant_isolation_policy ON public.stops;
        CREATE POLICY stops_tenant_isolation_policy ON public.stops
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.routes r
                    WHERE r.id = stops.route_id
                      AND r.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.routes r
                    WHERE r.id = stops.route_id
                      AND r.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('webhook_deliveries') THEN
        ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.webhook_deliveries FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation_policy ON public.webhook_deliveries;
        CREATE POLICY webhook_deliveries_tenant_isolation_policy ON public.webhook_deliveries
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('integration_api_keys') THEN
        ALTER TABLE public.integration_api_keys ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.integration_api_keys FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.integration_api_keys;
        CREATE POLICY tenant_isolation_policy ON public.integration_api_keys
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('integration_connections') THEN
        ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.integration_connections FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.integration_connections;
        CREATE POLICY tenant_isolation_policy ON public.integration_connections
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('integration_audit_logs') THEN
        ALTER TABLE public.integration_audit_logs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.integration_audit_logs FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.integration_audit_logs;
        CREATE POLICY tenant_isolation_policy ON public.integration_audit_logs
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('background_jobs') THEN
        ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.background_jobs FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.background_jobs;
        CREATE POLICY tenant_isolation_policy ON public.background_jobs
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('background_job_attempts') THEN
        ALTER TABLE public.background_job_attempts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.background_job_attempts FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.background_job_attempts;
        CREATE POLICY tenant_isolation_policy ON public.background_job_attempts
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('notification_outbox') THEN
        ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.notification_outbox;
        CREATE POLICY tenant_isolation_policy ON public.notification_outbox
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('notification_delivery_events') THEN
        ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.notification_delivery_events FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.notification_delivery_events;
        CREATE POLICY tenant_isolation_policy ON public.notification_delivery_events
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('observability_events') THEN
        ALTER TABLE public.observability_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.observability_events FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.observability_events;
        CREATE POLICY tenant_isolation_policy ON public.observability_events
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('sre_incidents') THEN
        ALTER TABLE public.sre_incidents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.sre_incidents FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.sre_incidents;
        CREATE POLICY tenant_isolation_policy ON public.sre_incidents
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('slo_definitions') THEN
        ALTER TABLE public.slo_definitions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.slo_definitions FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.slo_definitions;
        CREATE POLICY tenant_isolation_policy ON public.slo_definitions
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('slo_measurements') THEN
        ALTER TABLE public.slo_measurements ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.slo_measurements FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.slo_measurements;
        CREATE POLICY tenant_isolation_policy ON public.slo_measurements
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('grading_rubrics') THEN
        ALTER TABLE public.grading_rubrics ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.grading_rubrics FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS grading_rubrics_tenant_isolation_policy ON public.grading_rubrics;
        CREATE POLICY grading_rubrics_tenant_isolation_policy ON public.grading_rubrics
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grading_scales gs
                    WHERE gs.id = grading_rubrics.scale_id
                      AND gs.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grading_scales gs
                    WHERE gs.id = grading_rubrics.scale_id
                      AND gs.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF app_private.table_exists('metadata_objects') THEN
        ALTER TABLE public.metadata_objects ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_objects FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.metadata_objects;
        DROP POLICY IF EXISTS metadata_objects_tenant_isolation_select ON public.metadata_objects;
        DROP POLICY IF EXISTS metadata_objects_tenant_isolation_insert ON public.metadata_objects;
        DROP POLICY IF EXISTS metadata_objects_tenant_isolation_update ON public.metadata_objects;
        DROP POLICY IF EXISTS metadata_objects_tenant_isolation_delete ON public.metadata_objects;
        CREATE POLICY metadata_objects_tenant_isolation_select ON public.metadata_objects
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
                OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
            );
        CREATE POLICY metadata_objects_tenant_isolation_insert ON public.metadata_objects
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
        CREATE POLICY metadata_objects_tenant_isolation_update ON public.metadata_objects
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
        CREATE POLICY metadata_objects_tenant_isolation_delete ON public.metadata_objects
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('metadata_fields') THEN
        ALTER TABLE public.metadata_fields ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_fields FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS metadata_fields_tenant_isolation_select ON public.metadata_fields;
        DROP POLICY IF EXISTS metadata_fields_tenant_isolation_insert ON public.metadata_fields;
        DROP POLICY IF EXISTS metadata_fields_tenant_isolation_update ON public.metadata_fields;
        DROP POLICY IF EXISTS metadata_fields_tenant_isolation_delete ON public.metadata_fields;
        CREATE POLICY metadata_fields_tenant_isolation_select ON public.metadata_fields
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND (mo.tenant_id = (SELECT app_private.current_tenant_id()) OR mo.tenant_id IS NULL)
                )
            );
        CREATE POLICY metadata_fields_tenant_isolation_insert ON public.metadata_fields
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY metadata_fields_tenant_isolation_update ON public.metadata_fields
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY metadata_fields_tenant_isolation_delete ON public.metadata_fields
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('metadata_layouts') THEN
        ALTER TABLE public.metadata_layouts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_layouts FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS metadata_layouts_tenant_isolation_select ON public.metadata_layouts;
        DROP POLICY IF EXISTS metadata_layouts_tenant_isolation_insert ON public.metadata_layouts;
        DROP POLICY IF EXISTS metadata_layouts_tenant_isolation_update ON public.metadata_layouts;
        DROP POLICY IF EXISTS metadata_layouts_tenant_isolation_delete ON public.metadata_layouts;
        CREATE POLICY metadata_layouts_tenant_isolation_select ON public.metadata_layouts
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND (mo.tenant_id = (SELECT app_private.current_tenant_id()) OR mo.tenant_id IS NULL)
                )
            );
        CREATE POLICY metadata_layouts_tenant_isolation_insert ON public.metadata_layouts
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY metadata_layouts_tenant_isolation_update ON public.metadata_layouts
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY metadata_layouts_tenant_isolation_delete ON public.metadata_layouts
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('field_permissions') THEN
        ALTER TABLE public.field_permissions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.field_permissions FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS field_permissions_tenant_isolation_select ON public.field_permissions;
        DROP POLICY IF EXISTS field_permissions_tenant_isolation_insert ON public.field_permissions;
        DROP POLICY IF EXISTS field_permissions_tenant_isolation_update ON public.field_permissions;
        DROP POLICY IF EXISTS field_permissions_tenant_isolation_delete ON public.field_permissions;
        CREATE POLICY field_permissions_tenant_isolation_select ON public.field_permissions
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND (mo.tenant_id = (SELECT app_private.current_tenant_id()) OR mo.tenant_id IS NULL)
                )
            );
        CREATE POLICY field_permissions_tenant_isolation_insert ON public.field_permissions
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY field_permissions_tenant_isolation_update ON public.field_permissions
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY field_permissions_tenant_isolation_delete ON public.field_permissions
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND mo.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;

    IF app_private.table_exists('metadata_records') THEN
        ALTER TABLE public.metadata_records ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_records FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.metadata_records;
        DROP POLICY IF EXISTS metadata_records_tenant_isolation_policy ON public.metadata_records;
        CREATE POLICY metadata_records_tenant_isolation_policy ON public.metadata_records
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR (
                    tenant_id = (SELECT app_private.current_tenant_id())
                    AND EXISTS (
                        SELECT 1
                        FROM public.metadata_objects mo
                        WHERE mo.id = metadata_records.object_id
                          AND (
                              mo.tenant_id = (SELECT app_private.current_tenant_id())
                              OR (
                                  mo.tenant_id IS NULL
                                  AND COALESCE(mo.is_custom, false) = false
                              )
                          )
                    )
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR (
                    tenant_id = (SELECT app_private.current_tenant_id())
                    AND EXISTS (
                        SELECT 1
                        FROM public.metadata_objects mo
                        WHERE mo.id = metadata_records.object_id
                          AND (
                              mo.tenant_id = (SELECT app_private.current_tenant_id())
                              OR (
                                  mo.tenant_id IS NULL
                                  AND COALESCE(mo.is_custom, false) = false
                              )
                          )
                    )
                )
            );
    END IF;

    IF app_private.table_exists('metadata_values') THEN
        ALTER TABLE public.metadata_values ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_values FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS metadata_values_tenant_isolation_policy ON public.metadata_values;
        CREATE POLICY metadata_values_tenant_isolation_policy ON public.metadata_values
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_records mr
                    JOIN public.metadata_fields mf
                      ON mf.id = metadata_values.field_id
                     AND mf.object_id = mr.object_id
                    JOIN public.metadata_objects mo ON mo.id = mr.object_id
                    WHERE mr.id = metadata_values.record_id
                      AND mr.tenant_id = (SELECT app_private.current_tenant_id())
                      AND (
                          mo.tenant_id = (SELECT app_private.current_tenant_id())
                          OR (
                              mo.tenant_id IS NULL
                              AND COALESCE(mo.is_custom, false) = false
                          )
                      )
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_records mr
                    JOIN public.metadata_fields mf
                      ON mf.id = metadata_values.field_id
                     AND mf.object_id = mr.object_id
                    JOIN public.metadata_objects mo ON mo.id = mr.object_id
                    WHERE mr.id = metadata_values.record_id
                      AND mr.tenant_id = (SELECT app_private.current_tenant_id())
                      AND (
                          mo.tenant_id = (SELECT app_private.current_tenant_id())
                          OR (
                              mo.tenant_id IS NULL
                              AND COALESCE(mo.is_custom, false) = false
                          )
                      )
                )
            );
    END IF;

    IF app_private.table_exists('metadata_schema_versions') THEN
        ALTER TABLE public.metadata_schema_versions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_schema_versions FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS metadata_schema_versions_tenant_select ON public.metadata_schema_versions;
        DROP POLICY IF EXISTS metadata_schema_versions_tenant_insert ON public.metadata_schema_versions;
        DROP POLICY IF EXISTS metadata_schema_versions_tenant_update ON public.metadata_schema_versions;
        DROP POLICY IF EXISTS metadata_schema_versions_tenant_delete ON public.metadata_schema_versions;
        CREATE POLICY metadata_schema_versions_tenant_select ON public.metadata_schema_versions
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
                OR (tenant_id IS NULL AND status = 'PUBLISHED')
            );
        CREATE POLICY metadata_schema_versions_tenant_insert ON public.metadata_schema_versions
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
        CREATE POLICY metadata_schema_versions_tenant_update ON public.metadata_schema_versions
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
        CREATE POLICY metadata_schema_versions_tenant_delete ON public.metadata_schema_versions
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;

    IF app_private.table_exists('metadata_migration_jobs') THEN
        ALTER TABLE public.metadata_migration_jobs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.metadata_migration_jobs FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.metadata_migration_jobs;
        CREATE POLICY tenant_isolation_policy ON public.metadata_migration_jobs
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
    END IF;
END $$;

DO $$
BEGIN
    IF app_private.table_exists('multi_campus_hierarchy') THEN
        ALTER TABLE public.multi_campus_hierarchy ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.multi_campus_hierarchy FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.multi_campus_hierarchy;
        DROP POLICY IF EXISTS multi_campus_hierarchy_tenant_select ON public.multi_campus_hierarchy;
        DROP POLICY IF EXISTS multi_campus_hierarchy_platform_insert ON public.multi_campus_hierarchy;
        DROP POLICY IF EXISTS multi_campus_hierarchy_platform_update ON public.multi_campus_hierarchy;
        DROP POLICY IF EXISTS multi_campus_hierarchy_platform_delete ON public.multi_campus_hierarchy;
        CREATE POLICY multi_campus_hierarchy_tenant_select ON public.multi_campus_hierarchy
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR tenant_id = (SELECT app_private.current_tenant_id())
            );
        CREATE POLICY multi_campus_hierarchy_platform_insert ON public.multi_campus_hierarchy
            FOR INSERT
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY multi_campus_hierarchy_platform_update ON public.multi_campus_hierarchy
            FOR UPDATE
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY multi_campus_hierarchy_platform_delete ON public.multi_campus_hierarchy
            FOR DELETE
            USING (app_private.rls_bypass());
    END IF;

    IF app_private.table_exists('hq_groups') THEN
        ALTER TABLE public.hq_groups ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.hq_groups FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS hq_groups_tenant_select ON public.hq_groups;
        DROP POLICY IF EXISTS hq_groups_platform_insert ON public.hq_groups;
        DROP POLICY IF EXISTS hq_groups_platform_update ON public.hq_groups;
        DROP POLICY IF EXISTS hq_groups_platform_delete ON public.hq_groups;
        CREATE POLICY hq_groups_tenant_select ON public.hq_groups
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.multi_campus_hierarchy mch
                    WHERE mch.group_id = hq_groups.id
                      AND mch.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY hq_groups_platform_insert ON public.hq_groups
            FOR INSERT
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY hq_groups_platform_update ON public.hq_groups
            FOR UPDATE
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY hq_groups_platform_delete ON public.hq_groups
            FOR DELETE
            USING (app_private.rls_bypass());
    END IF;

    IF app_private.table_exists('group_policies') THEN
        ALTER TABLE public.group_policies ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.group_policies FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS group_policies_tenant_select ON public.group_policies;
        DROP POLICY IF EXISTS group_policies_platform_insert ON public.group_policies;
        DROP POLICY IF EXISTS group_policies_platform_update ON public.group_policies;
        DROP POLICY IF EXISTS group_policies_platform_delete ON public.group_policies;
        CREATE POLICY group_policies_tenant_select ON public.group_policies
            FOR SELECT
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.multi_campus_hierarchy mch
                    WHERE mch.group_id = group_policies.group_id
                      AND mch.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
        CREATE POLICY group_policies_platform_insert ON public.group_policies
            FOR INSERT
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY group_policies_platform_update ON public.group_policies
            FOR UPDATE
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY group_policies_platform_delete ON public.group_policies
            FOR DELETE
            USING (app_private.rls_bypass());
    END IF;

    IF app_private.table_exists('platform_broadcasts') THEN
        ALTER TABLE public.platform_broadcasts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.platform_broadcasts FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS platform_broadcasts_tenant_select ON public.platform_broadcasts;
        DROP POLICY IF EXISTS platform_broadcasts_platform_insert ON public.platform_broadcasts;
        DROP POLICY IF EXISTS platform_broadcasts_platform_update ON public.platform_broadcasts;
        DROP POLICY IF EXISTS platform_broadcasts_platform_delete ON public.platform_broadcasts;
        CREATE POLICY platform_broadcasts_tenant_select ON public.platform_broadcasts
            FOR SELECT
            USING (app_private.rls_bypass() OR app_private.has_tenant_context());
        CREATE POLICY platform_broadcasts_platform_insert ON public.platform_broadcasts
            FOR INSERT
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY platform_broadcasts_platform_update ON public.platform_broadcasts
            FOR UPDATE
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
        CREATE POLICY platform_broadcasts_platform_delete ON public.platform_broadcasts
            FOR DELETE
            USING (app_private.rls_bypass());
    END IF;

    IF app_private.table_exists('platform_audit_logs') THEN
        ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.platform_audit_logs FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS platform_audit_logs_platform_only ON public.platform_audit_logs;
        CREATE POLICY platform_audit_logs_platform_only ON public.platform_audit_logs
            AS PERMISSIVE FOR ALL
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
    END IF;

    IF app_private.table_exists('marketing_leads') THEN
        ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.marketing_leads FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS marketing_leads_platform_only ON public.marketing_leads;
        CREATE POLICY marketing_leads_platform_only ON public.marketing_leads
            AS PERMISSIVE FOR ALL
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
    END IF;

    -- Rate-limit keys can contain hashed public identifiers and span tenants.
    -- They are operational platform state, never tenant-queryable application data.
    IF app_private.table_exists('rate_limit_buckets') THEN
        ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.rate_limit_buckets FORCE ROW LEVEL SECURITY;
        -- Replace the legacy raw-GUC expression with the rollout-aware helper.
        -- Phase 1 still admits the legacy runtime-role bypass so the currently
        -- live unsigned release and rollback remain healthy; phase 2 makes the
        -- same policy platform-role-only without another policy rewrite.
        DROP POLICY IF EXISTS rate_limit_buckets_platform_access ON public.rate_limit_buckets;
        DROP POLICY IF EXISTS rate_limit_buckets_platform_only ON public.rate_limit_buckets;
        CREATE POLICY rate_limit_buckets_platform_only ON public.rate_limit_buckets
            AS PERMISSIVE FOR ALL
            USING (app_private.rls_bypass())
            WITH CHECK (app_private.rls_bypass());
    END IF;
END $$;

DO $$
BEGIN
    IF app_private.table_exists('password_reset_tokens') THEN
        ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.password_reset_tokens FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS password_reset_tokens_tenant_isolation_policy ON public.password_reset_tokens;
        CREATE POLICY password_reset_tokens_tenant_isolation_policy ON public.password_reset_tokens
            AS PERMISSIVE FOR ALL
            USING (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = password_reset_tokens.user_id
                      AND u.tenant_id = (SELECT app_private.current_tenant_id())
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = password_reset_tokens.user_id
                      AND u.tenant_id = (SELECT app_private.current_tenant_id())
                )
            );
    END IF;
END $$;
