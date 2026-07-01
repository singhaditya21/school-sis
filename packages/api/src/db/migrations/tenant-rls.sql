BEGIN;

SET LOCAL app.bypass_rls = 'on';
SET LOCAL app.current_tenant = '';

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '') IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_private.rls_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
$$;

CREATE OR REPLACE FUNCTION app_private.table_exists(table_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT to_regclass('public.' || table_name) IS NOT NULL
$$;

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
                    OR tenant_id = app_private.current_tenant_id()
                    OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                 )
                 WITH CHECK (
                    app_private.rls_bypass()
                    OR tenant_id = app_private.current_tenant_id()
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
                    OR tenant_id = app_private.current_tenant_id()
                 )
                 WITH CHECK (
                    app_private.rls_bypass()
                    OR tenant_id = app_private.current_tenant_id()
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
    USING (app_private.rls_bypass() OR id = app_private.current_tenant_id());
CREATE POLICY tenants_tenant_isolation_insert ON public.tenants
    FOR INSERT
    WITH CHECK (app_private.rls_bypass() OR id = app_private.current_tenant_id());
CREATE POLICY tenants_tenant_isolation_update ON public.tenants
    FOR UPDATE
    USING (app_private.rls_bypass() OR id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR id = app_private.current_tenant_id());
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
              AND t.id = app_private.current_tenant_id()
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
              AND t.id = app_private.current_tenant_id()
        )
    )
    WITH CHECK (
        app_private.rls_bypass()
        OR EXISTS (
            SELECT 1
            FROM public.tenants t
            WHERE t.company_id = companies.id
              AND t.id = app_private.current_tenant_id()
        )
    );
CREATE POLICY companies_tenant_isolation_delete ON public.companies
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
                      AND g.tenant_id = app_private.current_tenant_id()
                      AND s.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grades g
                    JOIN public.subjects s ON s.id = grade_subjects.subject_id
                    WHERE g.id = grade_subjects.grade_id
                      AND g.tenant_id = app_private.current_tenant_id()
                      AND s.tenant_id = app_private.current_tenant_id()
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
                      AND fp.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.fee_plans fp
                    WHERE fp.id = fee_components.fee_plan_id
                      AND fp.tenant_id = app_private.current_tenant_id()
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
                      AND e.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.exams e
                    WHERE e.id = exam_schedules.exam_id
                      AND e.tenant_id = app_private.current_tenant_id()
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
                      AND r.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.routes r
                    WHERE r.id = stops.route_id
                      AND r.tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                      AND gs.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.grading_scales gs
                    WHERE gs.id = grading_rubrics.scale_id
                      AND gs.tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
                OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
            );
        CREATE POLICY metadata_objects_tenant_isolation_insert ON public.metadata_objects
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            );
        CREATE POLICY metadata_objects_tenant_isolation_update ON public.metadata_objects
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            );
        CREATE POLICY metadata_objects_tenant_isolation_delete ON public.metadata_objects
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                      AND (mo.tenant_id = app_private.current_tenant_id() OR mo.tenant_id IS NULL)
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_fields.object_id
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND (mo.tenant_id = app_private.current_tenant_id() OR mo.tenant_id IS NULL)
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_objects mo
                    WHERE mo.id = metadata_layouts.object_id
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND (mo.tenant_id = app_private.current_tenant_id() OR mo.tenant_id IS NULL)
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_fields mf
                    JOIN public.metadata_objects mo ON mo.id = mf.object_id
                    WHERE mf.id = field_permissions.field_id
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                      AND mo.tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                    WHERE mr.id = metadata_values.record_id
                      AND mr.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.metadata_records mr
                    WHERE mr.id = metadata_values.record_id
                      AND mr.tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
                OR (tenant_id IS NULL AND status = 'PUBLISHED')
            );
        CREATE POLICY metadata_schema_versions_tenant_insert ON public.metadata_schema_versions
            FOR INSERT
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            );
        CREATE POLICY metadata_schema_versions_tenant_update ON public.metadata_schema_versions
            FOR UPDATE
            USING (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
            );
        CREATE POLICY metadata_schema_versions_tenant_delete ON public.metadata_schema_versions
            FOR DELETE
            USING (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR tenant_id = app_private.current_tenant_id()
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
                OR tenant_id = app_private.current_tenant_id()
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
                      AND mch.tenant_id = app_private.current_tenant_id()
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
                      AND mch.tenant_id = app_private.current_tenant_id()
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
                      AND u.tenant_id = app_private.current_tenant_id()
                )
            )
            WITH CHECK (
                app_private.rls_bypass()
                OR EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = password_reset_tokens.user_id
                      AND u.tenant_id = app_private.current_tenant_id()
                )
            );
    END IF;
END $$;

COMMIT;
