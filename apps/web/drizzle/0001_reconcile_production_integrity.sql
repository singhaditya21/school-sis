-- Restore handwritten integrity objects that were present in the historical
-- production migration chain but were not represented in Drizzle snapshots.
-- Every object is either brought to the exact desired definition or verified
-- before this transaction is allowed to commit.

DO $migration$
DECLARE
    definition record;
    target_table regclass;
    existing_type "char";
    existing_validated boolean;
    existing_no_inherit boolean;
    existing_tree text;
    probe_name text;
    probe_tree text;
    probe_matches boolean;
BEGIN
    FOR definition IN
        SELECT *
        FROM (VALUES
            ('public.metadata_objects', 'metadata_objects_status_check', $check$"status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')$check$),
            ('public.metadata_fields', 'metadata_fields_status_check', $check$"status" IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED')$check$),
            ('public.metadata_fields', 'metadata_fields_data_type_check', $check$"data_type" IN ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'PICKLIST', 'CURRENCY')$check$),
            ('public.metadata_schema_versions', 'metadata_schema_versions_status_check', $check$"status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')$check$),
            ('public.metadata_migration_jobs', 'metadata_migration_jobs_status_check', $check$"status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')$check$),
            ('public.integration_api_keys', 'integration_api_keys_status_check', $check$"status" IN ('ACTIVE', 'REVOKED', 'EXPIRED')$check$),
            ('public.integration_connections', 'integration_connections_status_check', $check$"status" IN ('ACTIVE', 'DISABLED', 'ERROR')$check$),
            ('public.integration_connections', 'integration_connections_mode_check', $check$"mode" IN ('MOCK', 'LIVE')$check$),
            ('public.integration_audit_logs', 'integration_audit_logs_direction_check', $check$"direction" IN ('INBOUND', 'OUTBOUND', 'INTERNAL')$check$),
            ('public.integration_audit_logs', 'integration_audit_logs_status_check', $check$"status" IN ('SUCCESS', 'FAILED', 'DENIED', 'QUEUED')$check$),
            ('public.background_jobs', 'background_jobs_scope_check', $check$"scope" IN ('TENANT', 'PLATFORM')$check$),
            ('public.background_jobs', 'background_jobs_status_check', $check$"status" IN ('QUEUED', 'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')$check$),
            ('public.background_jobs', 'background_jobs_scope_tenant_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.background_jobs', 'background_jobs_attempts_check', $check$"attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts"$check$),
            ('public.background_job_attempts', 'background_job_attempts_status_check', $check$"status" IN ('RUNNING', 'SUCCEEDED', 'FAILED')$check$),
            ('public.background_job_attempts', 'background_job_attempts_attempt_check', $check$"attempt_number" > 0$check$),
            ('public.notification_outbox', 'notification_outbox_channel_check', $check$"channel" IN ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP')$check$),
            ('public.notification_outbox', 'notification_outbox_status_check', $check$"status" IN ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED')$check$),
            ('public.notification_outbox', 'notification_outbox_attempts_check', $check$"attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts"$check$),
            ('public.notification_delivery_events', 'notification_delivery_events_status_check', $check$"status" IN ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED')$check$),
            ('public.observability_events', 'observability_events_scope_check', $check$"scope" IN ('TENANT', 'PLATFORM')$check$),
            ('public.observability_events', 'observability_events_scope_tenant_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.observability_events', 'observability_events_severity_check', $check$"severity" IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')$check$),
            ('public.sre_incidents', 'sre_incidents_scope_check', $check$"scope" IN ('TENANT', 'PLATFORM')$check$),
            ('public.sre_incidents', 'sre_incidents_scope_tenant_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.sre_incidents', 'sre_incidents_severity_check', $check$"severity" IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')$check$),
            ('public.sre_incidents', 'sre_incidents_status_check', $check$"status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED')$check$),
            ('public.sre_incidents', 'sre_incidents_occurrence_count_check', $check$"occurrence_count" > 0$check$),
            ('public.slo_definitions', 'slo_definitions_scope_check', $check$"scope" IN ('TENANT', 'PLATFORM')$check$),
            ('public.slo_definitions', 'slo_definitions_scope_tenant_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.slo_definitions', 'slo_definitions_target_check', $check$"target_bps" > 0 AND "target_bps" <= 10000$check$),
            ('public.slo_measurements', 'slo_measurements_counts_check', $check$"good_events" >= 0 AND "total_events" >= 0 AND "good_events" <= "total_events"$check$),
            ('public.slo_measurements', 'slo_measurements_status_check', $check$"status" IN ('HEALTHY', 'BREACHING', 'BREACHED', 'UNKNOWN')$check$),
            ('public.workflow_approval_requests', 'workflow_approval_requests_status_check', $check$"status" IN ('PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')$check$),
            ('public.workflow_approval_requests', 'workflow_approval_requests_priority_check', $check$"priority" IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')$check$),
            ('public.workflow_approval_requests', 'workflow_approval_requests_counts_check', $check$"min_approvals" > 0 AND "approvals_received" >= 0 AND "rejections_received" >= 0 AND "escalation_level" >= 0 AND "expires_at" >= "due_at"$check$),
            ('public.workflow_approval_reviews', 'workflow_approval_reviews_decision_check', $check$"decision" IN ('APPROVED', 'REJECTED')$check$),
            ('public.workflow_approval_events', 'workflow_approval_events_type_check', $check$"event_type" IN ('REQUESTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED', 'EXPIRED')$check$),
            ('public.workflow_approval_delegations', 'workflow_approval_delegations_time_check', $check$"ends_at" > "starts_at"$check$),
            ('public.operator_console_snapshots', 'operator_console_snapshots_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.operator_console_snapshots', 'operator_console_snapshots_status_check', $check$"status" IN ('HEALTHY', 'INFO', 'WARNING', 'CRITICAL')$check$),
            ('public.operator_console_snapshots', 'operator_console_snapshots_score_check', $check$"health_score" >= 0 AND "health_score" <= 100$check$),
            ('public.operator_console_runbooks', 'operator_console_runbooks_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.operator_console_runbooks', 'operator_console_runbooks_severity_check', $check$"severity" IN ('HEALTHY', 'INFO', 'WARNING', 'CRITICAL')$check$),
            ('public.operator_console_runbooks', 'operator_console_runbooks_status_check', $check$"status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED')$check$),
            ('public.operator_console_runbooks', 'operator_console_runbooks_version_check', $check$"version" > 0$check$),
            ('public.operator_console_action_logs', 'operator_console_actions_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.operator_console_action_logs', 'operator_console_actions_status_check', $check$"status" IN ('REQUESTED', 'APPROVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')$check$),
            ('public.bi_datasets', 'bi_datasets_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.bi_dashboards', 'bi_dashboards_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.bi_report_definitions', 'bi_report_definitions_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.bi_report_runs', 'bi_report_runs_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.bi_metric_snapshots', 'bi_metric_snapshots_scope_check', $check$("scope" = 'TENANT' AND "tenant_id" IS NOT NULL) OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)$check$),
            ('public.bi_datasets', 'bi_dataset_status_check', $check$"status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED')$check$),
            ('public.bi_dashboards', 'bi_dashboard_status_check', $check$"status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED')$check$),
            ('public.bi_report_definitions', 'bi_report_definition_status_check', $check$"status" IN ('ACTIVE', 'PAUSED', 'ARCHIVED')$check$),
            ('public.bi_report_runs', 'bi_report_run_status_check', $check$"status" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')$check$),
            ('public.bi_datasets', 'bi_version_check', $check$"version" > 0$check$),
            ('public.bi_dashboards', 'bi_dashboard_version_check', $check$"version" > 0$check$),
            ('public.bi_metric_snapshots', 'bi_metric_snapshot_period_check', $check$"period_end" >= "period_start"$check$),
            ('public.exams', 'exams_status_check', $check$"status" IN ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULT_REVIEW', 'PUBLISHED', 'ARCHIVED', 'CANCELLED')$check$)
        ) AS expected(relation_name, constraint_name, check_expression)
    LOOP
        target_table := to_regclass(definition.relation_name);
        IF target_table IS NULL THEN
            RAISE EXCEPTION 'Required reconciliation table % does not exist.', definition.relation_name;
        END IF;

        SELECT constraints.contype, constraints.convalidated, constraints.connoinherit
        INTO existing_type, existing_validated, existing_no_inherit
        FROM pg_constraint constraints
        WHERE constraints.conrelid = target_table
          AND constraints.conname = definition.constraint_name;

        IF NOT FOUND THEN
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s)',
                target_table,
                definition.constraint_name,
                definition.check_expression
            );
        END IF;

        SELECT
            constraints.contype,
            constraints.convalidated,
            constraints.connoinherit,
            regexp_replace(
                constraints.conbin::text,
                ':location -?[0-9]+',
                ':location ?',
                'g'
            )
        INTO existing_type, existing_validated, existing_no_inherit, existing_tree
        FROM pg_constraint constraints
        WHERE constraints.conrelid = target_table
          AND constraints.conname = definition.constraint_name;

        IF NOT FOUND
           OR existing_type IS DISTINCT FROM 'c'
           OR existing_validated IS DISTINCT FROM true
           OR existing_no_inherit IS DISTINCT FROM false THEN
            RAISE EXCEPTION 'Existing constraint %.% is not the required validated inheritable CHECK constraint.', definition.relation_name, definition.constraint_name;
        END IF;

        -- PostgreSQL's deparsed expression text can change between server
        -- releases. Parse the desired expression on this server, compare its
        -- normalized expression tree, and use an exception subtransaction to
        -- roll the probe constraint back without ever dropping a real object.
        probe_name := '__school_sis_probe_' || substr(
            md5(definition.relation_name || ':' || definition.constraint_name),
            1,
            32
        );
        IF EXISTS (
            SELECT 1
            FROM pg_constraint constraints
            WHERE constraints.conrelid = target_table
              AND constraints.conname = probe_name
        ) THEN
            RAISE EXCEPTION 'Reserved reconciliation probe constraint %.% already exists.', definition.relation_name, probe_name;
        END IF;

        probe_matches := false;
        BEGIN
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                target_table,
                probe_name,
                definition.check_expression
            );
            SELECT regexp_replace(
                       constraints.conbin::text,
                       ':location -?[0-9]+',
                       ':location ?',
                       'g'
                   )
            INTO probe_tree
            FROM pg_constraint constraints
            WHERE constraints.conrelid = target_table
              AND constraints.conname = probe_name;
            probe_matches := existing_tree IS NOT DISTINCT FROM probe_tree;
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'school_sis_reconciliation_probe_rollback';
        EXCEPTION
            WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM <> 'school_sis_reconciliation_probe_rollback' THEN
                    RAISE;
                END IF;
        END;

        IF probe_matches IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'Existing constraint %.% does not have the required CHECK expression.', definition.relation_name, definition.constraint_name;
        END IF;
    END LOOP;
END
$migration$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_metadata_objects_system_api_name"
    ON "public"."metadata_objects" USING btree ("api_name")
    WHERE "tenant_id" IS NULL AND "status" <> 'ARCHIVED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_records_tenant_object"
    ON "public"."metadata_records" USING btree ("tenant_id", "object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_tenant_status"
    ON "public"."exams" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_result_hashes_result"
    ON "public"."exam_result_hashes" USING btree ("result_id");
--> statement-breakpoint

DO $migration$
DECLARE
    definition record;
    actual_table oid;
    actual_unique boolean;
    actual_valid boolean;
    actual_ready boolean;
    actual_live boolean;
    actual_key_count smallint;
    actual_attribute_count smallint;
    actual_expression pg_node_tree;
    actual_predicate pg_node_tree;
    actual_columns text[];
    actual_definition text;
BEGIN
    FOR definition IN
        SELECT *
        FROM (VALUES
            ('uq_metadata_objects_system_api_name', 'public.metadata_objects', true, ARRAY['api_name']::text[], $index$CREATE UNIQUE INDEX uq_metadata_objects_system_api_name ON public.metadata_objects USING btree (api_name) WHERE ((tenant_id IS NULL) AND ((status)::text <> 'ARCHIVED'::text))$index$),
            ('idx_metadata_records_tenant_object', 'public.metadata_records', false, ARRAY['tenant_id', 'object_id']::text[], $index$CREATE INDEX idx_metadata_records_tenant_object ON public.metadata_records USING btree (tenant_id, object_id)$index$),
            ('idx_exams_tenant_status', 'public.exams', false, ARRAY['tenant_id', 'status']::text[], $index$CREATE INDEX idx_exams_tenant_status ON public.exams USING btree (tenant_id, status)$index$),
            ('uq_exam_result_hashes_result', 'public.exam_result_hashes', true, ARRAY['result_id']::text[], $index$CREATE UNIQUE INDEX uq_exam_result_hashes_result ON public.exam_result_hashes USING btree (result_id)$index$)
        ) AS expected(index_name, relation_name, is_unique, key_columns, index_definition)
    LOOP
        SELECT
            indexes.indrelid,
            indexes.indisunique,
            indexes.indisvalid,
            indexes.indisready,
            indexes.indislive,
            indexes.indnkeyatts,
            indexes.indnatts,
            indexes.indexprs,
            indexes.indpred,
            pg_get_indexdef(indexes.indexrelid, 0, false),
            ARRAY(
                SELECT attributes.attname::text
                FROM unnest(indexes.indkey::smallint[]) WITH ORDINALITY AS keys(attnum, position)
                JOIN pg_attribute attributes
                  ON attributes.attrelid = indexes.indrelid
                 AND attributes.attnum = keys.attnum
                WHERE keys.position <= indexes.indnkeyatts
                ORDER BY keys.position
            )
        INTO
            actual_table,
            actual_unique,
            actual_valid,
            actual_ready,
            actual_live,
            actual_key_count,
            actual_attribute_count,
            actual_expression,
            actual_predicate,
            actual_definition,
            actual_columns
        FROM pg_index indexes
        JOIN pg_class index_classes ON index_classes.oid = indexes.indexrelid
        JOIN pg_namespace namespaces ON namespaces.oid = index_classes.relnamespace
        WHERE namespaces.nspname = 'public'
          AND index_classes.relname = definition.index_name;

        IF NOT FOUND
           OR actual_table IS DISTINCT FROM to_regclass(definition.relation_name)
           OR actual_unique IS DISTINCT FROM definition.is_unique
           OR actual_valid IS DISTINCT FROM true
           OR actual_ready IS DISTINCT FROM true
           OR actual_live IS DISTINCT FROM true
           OR actual_key_count IS DISTINCT FROM cardinality(definition.key_columns)
           OR actual_attribute_count IS DISTINCT FROM actual_key_count
           OR actual_expression IS NOT NULL
           OR actual_columns IS DISTINCT FROM definition.key_columns
           OR actual_definition IS DISTINCT FROM definition.index_definition THEN
            RAISE EXCEPTION 'Index public.% does not exactly match the required reconciliation index structure.', definition.index_name;
        END IF;
    END LOOP;
END
$migration$;
--> statement-breakpoint

DO $migration$
DECLARE
    expected_function oid;
    expected_source text := $source$
DECLARE
    payload JSON;
BEGIN
    IF TG_TABLE_NAME = 'students' THEN
        payload = json_build_object('type', 'student', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
    ELSIF TG_TABLE_NAME = 'invoices' THEN
        payload = json_build_object('type', 'invoice', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
    ELSE
        RETURN NEW;
    END IF;

    PERFORM pg_notify('entity_changes', payload::text);
    RETURN NEW;
END;
$source$;
    actual_source text;
    definition record;
    target_table regclass;
    actual_table oid;
    actual_function oid;
    actual_type smallint;
    actual_enabled "char";
    actual_columns int2vector;
    actual_condition pg_node_tree;
BEGIN
    expected_function := to_regprocedure('public.notify_entity_change()');
    IF expected_function IS NULL THEN
        EXECUTE $ddl$
            CREATE FUNCTION "public"."notify_entity_change"()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $function$
            DECLARE
                payload JSON;
            BEGIN
                IF TG_TABLE_NAME = 'students' THEN
                    payload = json_build_object('type', 'student', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
                ELSIF TG_TABLE_NAME = 'invoices' THEN
                    payload = json_build_object('type', 'invoice', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
                ELSE
                    RETURN NEW;
                END IF;

                PERFORM pg_notify('entity_changes', payload::text);
                RETURN NEW;
            END;
            $function$
        $ddl$;
        expected_function := to_regprocedure('public.notify_entity_change()');
    END IF;

    SELECT procedures.prosrc
    INTO actual_source
    FROM pg_proc procedures
    JOIN pg_language languages ON languages.oid = procedures.prolang
    WHERE procedures.oid = expected_function
      AND procedures.prorettype = 'trigger'::regtype
      AND procedures.prokind = 'f'
      AND procedures.pronargs = 0
      AND procedures.provolatile = 'v'
      AND procedures.prosecdef = false
      AND procedures.proisstrict = false
      AND procedures.proleakproof = false
      AND procedures.proparallel = 'u'
      AND procedures.proconfig IS NULL
      AND languages.lanname = 'plpgsql';

    IF NOT FOUND
       OR regexp_replace(btrim(actual_source), '[[:space:]]+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(btrim(expected_source), '[[:space:]]+', ' ', 'g') THEN
        RAISE EXCEPTION 'public.notify_entity_change() does not have the required trigger-function contract.';
    END IF;

    FOR definition IN
        SELECT *
        FROM (VALUES
            ('trg_student_changes', 'public.students'),
            ('trg_invoice_changes', 'public.invoices')
        ) AS expected(trigger_name, relation_name)
    LOOP
        target_table := to_regclass(definition.relation_name);
        IF target_table IS NULL THEN
            RAISE EXCEPTION 'Required reconciliation table % does not exist.', definition.relation_name;
        END IF;

        SELECT triggers.tgrelid, triggers.tgfoid, triggers.tgtype,
               triggers.tgenabled, triggers.tgattr, triggers.tgqual
        INTO actual_table, actual_function, actual_type,
             actual_enabled, actual_columns, actual_condition
        FROM pg_trigger triggers
        WHERE triggers.tgrelid = target_table
          AND triggers.tgname = definition.trigger_name
          AND NOT triggers.tgisinternal;

        IF NOT FOUND THEN
            EXECUTE format(
                'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.notify_entity_change()',
                definition.trigger_name,
                target_table
            );
        END IF;

        SELECT triggers.tgrelid, triggers.tgfoid, triggers.tgtype,
               triggers.tgenabled, triggers.tgattr, triggers.tgqual
        INTO actual_table, actual_function, actual_type,
             actual_enabled, actual_columns, actual_condition
        FROM pg_trigger triggers
        WHERE triggers.tgrelid = target_table
          AND triggers.tgname = definition.trigger_name
          AND NOT triggers.tgisinternal;

        IF NOT FOUND
           OR actual_table IS DISTINCT FROM target_table
           OR actual_function IS DISTINCT FROM expected_function
           OR actual_type IS DISTINCT FROM 21
           OR actual_enabled IS DISTINCT FROM 'O'
           OR actual_columns IS DISTINCT FROM ''::int2vector
           OR actual_condition IS NOT NULL THEN
            RAISE EXCEPTION 'Trigger %.% does not exactly match the required notification trigger contract.', definition.relation_name, definition.trigger_name;
        END IF;
    END LOOP;

    IF (
        SELECT pg_get_expr(defaults.adbin, defaults.adrelid, false)
        FROM pg_attrdef defaults
        JOIN pg_attribute attributes
          ON attributes.attrelid = defaults.adrelid
         AND attributes.attnum = defaults.adnum
        WHERE defaults.adrelid = 'public.integration_connections'::regclass
          AND attributes.attname = 'mode'
    ) IS DISTINCT FROM '''LIVE''::character varying' THEN
        EXECUTE $ddl$
            ALTER TABLE "public"."integration_connections"
                ALTER COLUMN "mode" SET DEFAULT 'LIVE'
        $ddl$;
    END IF;

    IF (
        SELECT pg_get_expr(defaults.adbin, defaults.adrelid, false)
        FROM pg_attrdef defaults
        JOIN pg_attribute attributes
          ON attributes.attrelid = defaults.adrelid
         AND attributes.attnum = defaults.adnum
        WHERE defaults.adrelid = 'public.integration_connections'::regclass
          AND attributes.attname = 'mode'
    ) IS DISTINCT FROM '''LIVE''::character varying' THEN
        RAISE EXCEPTION 'public.integration_connections.mode does not default to LIVE.';
    END IF;
END
$migration$;
