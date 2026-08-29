-- Stage 3: integrity guard — population triggers + MATCH FULL composite FKs.
-- Custom migration (drizzle cannot express triggers / NOT VALID / MATCH FULL).
-- Additive only (no DROP / ALTER TYPE / SET NOT NULL) → no destructive marker.
-- MUST NOT deploy until db:backfill:owners + db:backfill:scope have run on the
-- target: the triggers derive owner/group from tenants.owner_id and the FKs
-- reject a partial triple, so unbackfilled data would make new inserts fail.
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_from_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        IF NEW.tenant_id IS NOT NULL THEN
            SELECT t.owner_id, t.company_id INTO NEW.owner_id, NEW.group_id
            FROM public.tenants t WHERE t.id = NEW.tenant_id;
        ELSE
            NEW.owner_id := NULL; NEW.group_id := NULL;
        END IF;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_ai_token_logs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL AND (NEW.owner_id IS NULL OR NEW.company_id IS NULL) THEN
        SELECT t.owner_id, t.company_id INTO NEW.owner_id, NEW.company_id
        FROM public.tenants t WHERE t.id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_owner_from_company() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.company_id IS NOT NULL AND NEW.owner_id IS NULL THEN
        SELECT c.owner_id INTO NEW.owner_id FROM public.companies c WHERE c.id = NEW.company_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.autocreate_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.owner_id IS NULL THEN
        INSERT INTO public.owners (name) VALUES (NEW.name) RETURNING id INTO NEW.owner_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_grade_subjects() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.grades g JOIN public.tenants t ON t.id = g.tenant_id WHERE g.id = NEW.grade_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_fee_components() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.fee_plans fp JOIN public.tenants t ON t.id = fp.tenant_id WHERE fp.id = NEW.fee_plan_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_stops() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.routes r JOIN public.tenants t ON t.id = r.tenant_id WHERE r.id = NEW.route_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_exam_schedules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.exams e JOIN public.tenants t ON t.id = e.tenant_id WHERE e.id = NEW.exam_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_metadata_values() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.metadata_records mr JOIN public.tenants t ON t.id = mr.tenant_id WHERE mr.id = NEW.record_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_grading_rubrics() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.grading_scales gs JOIN public.tenants t ON t.id = gs.tenant_id WHERE gs.id = NEW.scale_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_metadata_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.metadata_objects mo JOIN public.tenants t ON t.id = mo.tenant_id WHERE mo.id = NEW.object_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_metadata_layouts() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.metadata_objects mo JOIN public.tenants t ON t.id = mo.tenant_id WHERE mo.id = NEW.object_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.fill_scope_field_permissions() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        SELECT t.id, t.company_id, t.owner_id INTO NEW.school_id, NEW.group_id, NEW.owner_id
        FROM public.metadata_fields mf JOIN public.metadata_objects mo ON mo.id = mf.object_id JOIN public.tenants t ON t.id = mo.tenant_id WHERE mf.id = NEW.field_id;
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
-- ═══ Population triggers ═══
CREATE TRIGGER companies_autocreate_owner BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION app_private.autocreate_owner();
--> statement-breakpoint
CREATE TRIGGER tenants_fill_owner BEFORE INSERT OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION app_private.fill_owner_from_company();
--> statement-breakpoint
CREATE TRIGGER academic_events_fill_scope BEFORE INSERT OR UPDATE ON public.academic_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER academic_years_fill_scope BEFORE INSERT OR UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER admission_applications_fill_scope BEFORE INSERT OR UPDATE ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER admission_documents_fill_scope BEFORE INSERT OR UPDATE ON public.admission_documents FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER admission_leads_fill_scope BEFORE INSERT OR UPDATE ON public.admission_leads FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER agent_approvals_fill_scope BEFORE INSERT OR UPDATE ON public.agent_approvals FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER agent_audit_logs_fill_scope BEFORE INSERT OR UPDATE ON public.agent_audit_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER alumni_events_fill_scope BEFORE INSERT OR UPDATE ON public.alumni_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER alumni_profiles_fill_scope BEFORE INSERT OR UPDATE ON public.alumni_profiles FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER alumni_registrations_fill_scope BEFORE INSERT OR UPDATE ON public.alumni_registrations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER appointments_fill_scope BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER assets_fill_scope BEFORE INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER attendance_records_fill_scope BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER audit_logs_fill_scope BEFORE INSERT OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER background_job_attempts_fill_scope BEFORE INSERT OR UPDATE ON public.background_job_attempts FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER background_jobs_fill_scope BEFORE INSERT OR UPDATE ON public.background_jobs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER bi_dashboards_fill_scope BEFORE INSERT OR UPDATE ON public.bi_dashboards FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER bi_datasets_fill_scope BEFORE INSERT OR UPDATE ON public.bi_datasets FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER bi_metric_snapshots_fill_scope BEFORE INSERT OR UPDATE ON public.bi_metric_snapshots FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER bi_report_definitions_fill_scope BEFORE INSERT OR UPDATE ON public.bi_report_definitions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER bi_report_runs_fill_scope BEFORE INSERT OR UPDATE ON public.bi_report_runs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER book_issues_fill_scope BEFORE INSERT OR UPDATE ON public.book_issues FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER book_reservations_fill_scope BEFORE INSERT OR UPDATE ON public.book_reservations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER books_fill_scope BEFORE INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER certificate_templates_fill_scope BEFORE INSERT OR UPDATE ON public.certificate_templates FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER coaching_batches_fill_scope BEFORE INSERT OR UPDATE ON public.coaching_batches FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER concessions_fill_scope BEFORE INSERT OR UPDATE ON public.concessions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER consent_forms_fill_scope BEFORE INSERT OR UPDATE ON public.consent_forms FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER consent_responses_fill_scope BEFORE INSERT OR UPDATE ON public.consent_responses FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER consents_fill_scope BEFORE INSERT OR UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER consumables_fill_scope BEFORE INSERT OR UPDATE ON public.consumables FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER designations_fill_scope BEFORE INSERT OR UPDATE ON public.designations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER diary_entries_fill_scope BEFORE INSERT OR UPDATE ON public.diary_entries FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER digilocker_sync_logs_fill_scope BEFORE INSERT OR UPDATE ON public.digilocker_sync_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER driver_background_checks_fill_scope BEFORE INSERT OR UPDATE ON public.driver_background_checks FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER embeddings_fill_scope BEFORE INSERT OR UPDATE ON public.embeddings FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER exam_proctoring_logs_fill_scope BEFORE INSERT OR UPDATE ON public.exam_proctoring_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER exam_result_hashes_fill_scope BEFORE INSERT OR UPDATE ON public.exam_result_hashes FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER exams_fill_scope BEFORE INSERT OR UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER faculty_workload_fill_scope BEFORE INSERT OR UPDATE ON public.faculty_workload FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER fee_plans_fill_scope BEFORE INSERT OR UPDATE ON public.fee_plans FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER fine_rules_fill_scope BEFORE INSERT OR UPDATE ON public.fine_rules FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER grades_fill_scope BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER grading_scales_fill_scope BEFORE INSERT OR UPDATE ON public.grading_scales FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER guardians_fill_scope BEFORE INSERT OR UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER hardware_tokens_fill_scope BEFORE INSERT OR UPDATE ON public.hardware_tokens FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER health_incidents_fill_scope BEFORE INSERT OR UPDATE ON public.health_incidents FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER health_records_fill_scope BEFORE INSERT OR UPDATE ON public.health_records FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER homework_assignments_fill_scope BEFORE INSERT OR UPDATE ON public.homework_assignments FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER homework_submissions_fill_scope BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER host_families_fill_scope BEFORE INSERT OR UPDATE ON public.host_families FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER hostel_allocations_fill_scope BEFORE INSERT OR UPDATE ON public.hostel_allocations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER hostel_fees_fill_scope BEFORE INSERT OR UPDATE ON public.hostel_fees FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER hostel_rooms_fill_scope BEFORE INSERT OR UPDATE ON public.hostel_rooms FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER hostels_fill_scope BEFORE INSERT OR UPDATE ON public.hostels FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER id_cards_fill_scope BEFORE INSERT OR UPDATE ON public.id_cards FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER immunizations_fill_scope BEFORE INSERT OR UPDATE ON public.immunizations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER integration_api_keys_fill_scope BEFORE INSERT OR UPDATE ON public.integration_api_keys FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER integration_audit_logs_fill_scope BEFORE INSERT OR UPDATE ON public.integration_audit_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER integration_connections_fill_scope BEFORE INSERT OR UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER international_placements_fill_scope BEFORE INSERT OR UPDATE ON public.international_placements FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER invoices_fill_scope BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER issued_certificates_fill_scope BEFORE INSERT OR UPDATE ON public.issued_certificates FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER leave_policies_fill_scope BEFORE INSERT OR UPDATE ON public.leave_policies FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER leave_requests_fill_scope BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER lesson_plans_fill_scope BEFORE INSERT OR UPDATE ON public.lesson_plans FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER live_gps_pings_fill_scope BEFORE INSERT OR UPDATE ON public.live_gps_pings FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER medication_schedules_fill_scope BEFORE INSERT OR UPDATE ON public.medication_schedules FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER mess_menus_fill_scope BEFORE INSERT OR UPDATE ON public.mess_menus FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER message_logs_fill_scope BEFORE INSERT OR UPDATE ON public.message_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER message_templates_fill_scope BEFORE INSERT OR UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER messages_fill_scope BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER metadata_migration_jobs_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_migration_jobs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER metadata_objects_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_objects FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER metadata_records_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_records FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER metadata_schema_versions_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_schema_versions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER metadata_workflows_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_workflows FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER notification_delivery_events_fill_scope BEFORE INSERT OR UPDATE ON public.notification_delivery_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER notification_outbox_fill_scope BEFORE INSERT OR UPDATE ON public.notification_outbox FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER nurse_visit_logs_fill_scope BEFORE INSERT OR UPDATE ON public.nurse_visit_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER observability_events_fill_scope BEFORE INSERT OR UPDATE ON public.observability_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER operator_console_action_logs_fill_scope BEFORE INSERT OR UPDATE ON public.operator_console_action_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER operator_console_runbooks_fill_scope BEFORE INSERT OR UPDATE ON public.operator_console_runbooks FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER operator_console_snapshots_fill_scope BEFORE INSERT OR UPDATE ON public.operator_console_snapshots FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER payment_audit_logs_fill_scope BEFORE INSERT OR UPDATE ON public.payment_audit_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER payment_orders_fill_scope BEFORE INSERT OR UPDATE ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER payment_provider_events_fill_scope BEFORE INSERT OR UPDATE ON public.payment_provider_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER payments_fill_scope BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER periods_fill_scope BEFORE INSERT OR UPDATE ON public.periods FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER quiz_attempts_fill_scope BEFORE INSERT OR UPDATE ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER quiz_questions_fill_scope BEFORE INSERT OR UPDATE ON public.quiz_questions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER quizzes_fill_scope BEFORE INSERT OR UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER receipts_fill_scope BEFORE INSERT OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER routes_fill_scope BEFORE INSERT OR UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER sections_fill_scope BEFORE INSERT OR UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER slo_definitions_fill_scope BEFORE INSERT OR UPDATE ON public.slo_definitions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER slo_measurements_fill_scope BEFORE INSERT OR UPDATE ON public.slo_measurements FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER sre_incidents_fill_scope BEFORE INSERT OR UPDATE ON public.sre_incidents FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER staff_departments_fill_scope BEFORE INSERT OR UPDATE ON public.staff_departments FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER staff_profiles_fill_scope BEFORE INSERT OR UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER stock_alerts_fill_scope BEFORE INSERT OR UPDATE ON public.stock_alerts FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER student_documents_fill_scope BEFORE INSERT OR UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER student_results_fill_scope BEFORE INSERT OR UPDATE ON public.student_results FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER student_transport_fill_scope BEFORE INSERT OR UPDATE ON public.student_transport FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER student_visas_fill_scope BEFORE INSERT OR UPDATE ON public.student_visas FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER students_fill_scope BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER subjects_fill_scope BEFORE INSERT OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER substitution_requests_fill_scope BEFORE INSERT OR UPDATE ON public.substitution_requests FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER substitutions_fill_scope BEFORE INSERT OR UPDATE ON public.substitutions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER terms_fill_scope BEFORE INSERT OR UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER test_series_fill_scope BEFORE INSERT OR UPDATE ON public.test_series FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER test_series_results_fill_scope BEFORE INSERT OR UPDATE ON public.test_series_results FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER timetable_entries_fill_scope BEFORE INSERT OR UPDATE ON public.timetable_entries FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER university_courses_fill_scope BEFORE INSERT OR UPDATE ON public.university_courses FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER university_programs_fill_scope BEFORE INSERT OR UPDATE ON public.university_programs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER users_fill_scope BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER vehicle_maintenance_logs_fill_scope BEFORE INSERT OR UPDATE ON public.vehicle_maintenance_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER vehicles_fill_scope BEFORE INSERT OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER visitors_fill_scope BEFORE INSERT OR UPDATE ON public.visitors FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER webhook_deliveries_fill_scope BEFORE INSERT OR UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER webhook_subscriptions_fill_scope BEFORE INSERT OR UPDATE ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER workflow_approval_delegations_fill_scope BEFORE INSERT OR UPDATE ON public.workflow_approval_delegations FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER workflow_approval_events_fill_scope BEFORE INSERT OR UPDATE ON public.workflow_approval_events FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER workflow_approval_requests_fill_scope BEFORE INSERT OR UPDATE ON public.workflow_approval_requests FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER workflow_approval_reviews_fill_scope BEFORE INSERT OR UPDATE ON public.workflow_approval_reviews FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER workflows_fill_scope BEFORE INSERT OR UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_from_tenant();
--> statement-breakpoint
CREATE TRIGGER ai_token_logs_fill_scope BEFORE INSERT OR UPDATE ON public.ai_token_logs FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_ai_token_logs();
--> statement-breakpoint
CREATE TRIGGER grade_subjects_fill_scope BEFORE INSERT OR UPDATE ON public.grade_subjects FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_grade_subjects();
--> statement-breakpoint
CREATE TRIGGER fee_components_fill_scope BEFORE INSERT OR UPDATE ON public.fee_components FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_fee_components();
--> statement-breakpoint
CREATE TRIGGER stops_fill_scope BEFORE INSERT OR UPDATE ON public.stops FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_stops();
--> statement-breakpoint
CREATE TRIGGER exam_schedules_fill_scope BEFORE INSERT OR UPDATE ON public.exam_schedules FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_exam_schedules();
--> statement-breakpoint
CREATE TRIGGER metadata_values_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_values FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_metadata_values();
--> statement-breakpoint
CREATE TRIGGER grading_rubrics_fill_scope BEFORE INSERT OR UPDATE ON public.grading_rubrics FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_grading_rubrics();
--> statement-breakpoint
CREATE TRIGGER metadata_fields_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_fields FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_metadata_fields();
--> statement-breakpoint
CREATE TRIGGER metadata_layouts_fill_scope BEFORE INSERT OR UPDATE ON public.metadata_layouts FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_metadata_layouts();
--> statement-breakpoint
CREATE TRIGGER field_permissions_fill_scope BEFORE INSERT OR UPDATE ON public.field_permissions FOR EACH ROW EXECUTE FUNCTION app_private.fill_scope_field_permissions();
--> statement-breakpoint
-- ═══ Tier keys + company→owner drift FK ═══
ALTER TABLE public.companies ADD CONSTRAINT companies_id_owner_uq UNIQUE (id, owner_id);
--> statement-breakpoint
ALTER TABLE public.tenants ADD CONSTRAINT tenants_id_group_owner_uq UNIQUE (id, company_id, owner_id);
--> statement-breakpoint
ALTER TABLE public.tenants ADD CONSTRAINT tenants_company_owner_fk FOREIGN KEY (company_id, owner_id) REFERENCES public.companies (id, owner_id) MATCH FULL ON UPDATE CASCADE NOT VALID;
--> statement-breakpoint
-- ═══ Scoped composite FKs — MATCH FULL enforces all-or-none + tenant match ═══
ALTER TABLE public.academic_events ADD CONSTRAINT academic_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.admission_applications ADD CONSTRAINT admission_applications_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.admission_documents ADD CONSTRAINT admission_documents_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.admission_leads ADD CONSTRAINT admission_leads_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.agent_approvals ADD CONSTRAINT agent_approvals_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.agent_audit_logs ADD CONSTRAINT agent_audit_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.alumni_events ADD CONSTRAINT alumni_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.alumni_profiles ADD CONSTRAINT alumni_profiles_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.alumni_registrations ADD CONSTRAINT alumni_registrations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.appointments ADD CONSTRAINT appointments_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.assets ADD CONSTRAINT assets_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.background_job_attempts ADD CONSTRAINT background_job_attempts_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.background_jobs ADD CONSTRAINT background_jobs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.bi_dashboards ADD CONSTRAINT bi_dashboards_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.bi_datasets ADD CONSTRAINT bi_datasets_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.bi_metric_snapshots ADD CONSTRAINT bi_metric_snapshots_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.bi_report_definitions ADD CONSTRAINT bi_report_definitions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.bi_report_runs ADD CONSTRAINT bi_report_runs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.book_issues ADD CONSTRAINT book_issues_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.book_reservations ADD CONSTRAINT book_reservations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.books ADD CONSTRAINT books_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.certificate_templates ADD CONSTRAINT certificate_templates_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.coaching_batches ADD CONSTRAINT coaching_batches_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.concessions ADD CONSTRAINT concessions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.consent_forms ADD CONSTRAINT consent_forms_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.consent_responses ADD CONSTRAINT consent_responses_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.consents ADD CONSTRAINT consents_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.consumables ADD CONSTRAINT consumables_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.designations ADD CONSTRAINT designations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.diary_entries ADD CONSTRAINT diary_entries_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.digilocker_sync_logs ADD CONSTRAINT digilocker_sync_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.driver_background_checks ADD CONSTRAINT driver_background_checks_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.embeddings ADD CONSTRAINT embeddings_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.exam_proctoring_logs ADD CONSTRAINT exam_proctoring_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.exam_result_hashes ADD CONSTRAINT exam_result_hashes_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.exams ADD CONSTRAINT exams_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.faculty_workload ADD CONSTRAINT faculty_workload_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.fee_plans ADD CONSTRAINT fee_plans_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.grades ADD CONSTRAINT grades_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.grading_scales ADD CONSTRAINT grading_scales_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.guardians ADD CONSTRAINT guardians_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.hardware_tokens ADD CONSTRAINT hardware_tokens_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.health_incidents ADD CONSTRAINT health_incidents_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.health_records ADD CONSTRAINT health_records_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.homework_assignments ADD CONSTRAINT homework_assignments_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.homework_submissions ADD CONSTRAINT homework_submissions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.host_families ADD CONSTRAINT host_families_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.hostel_allocations ADD CONSTRAINT hostel_allocations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.hostel_fees ADD CONSTRAINT hostel_fees_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.hostel_rooms ADD CONSTRAINT hostel_rooms_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.hostels ADD CONSTRAINT hostels_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.id_cards ADD CONSTRAINT id_cards_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.immunizations ADD CONSTRAINT immunizations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.integration_api_keys ADD CONSTRAINT integration_api_keys_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.integration_audit_logs ADD CONSTRAINT integration_audit_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.integration_connections ADD CONSTRAINT integration_connections_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.international_placements ADD CONSTRAINT international_placements_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.invoices ADD CONSTRAINT invoices_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.issued_certificates ADD CONSTRAINT issued_certificates_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.leave_policies ADD CONSTRAINT leave_policies_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.lesson_plans ADD CONSTRAINT lesson_plans_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.live_gps_pings ADD CONSTRAINT live_gps_pings_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.medication_schedules ADD CONSTRAINT medication_schedules_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.mess_menus ADD CONSTRAINT mess_menus_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.message_logs ADD CONSTRAINT message_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT messages_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_migration_jobs ADD CONSTRAINT metadata_migration_jobs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_objects ADD CONSTRAINT metadata_objects_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_records ADD CONSTRAINT metadata_records_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_schema_versions ADD CONSTRAINT metadata_schema_versions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_workflows ADD CONSTRAINT metadata_workflows_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.notification_delivery_events ADD CONSTRAINT notification_delivery_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.nurse_visit_logs ADD CONSTRAINT nurse_visit_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.observability_events ADD CONSTRAINT observability_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.operator_console_action_logs ADD CONSTRAINT operator_console_action_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.operator_console_runbooks ADD CONSTRAINT operator_console_runbooks_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.operator_console_snapshots ADD CONSTRAINT operator_console_snapshots_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payment_audit_logs ADD CONSTRAINT payment_audit_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payment_provider_events ADD CONSTRAINT payment_provider_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payments ADD CONSTRAINT payments_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.periods ADD CONSTRAINT periods_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.receipts ADD CONSTRAINT receipts_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.routes ADD CONSTRAINT routes_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.sections ADD CONSTRAINT sections_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.slo_definitions ADD CONSTRAINT slo_definitions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.slo_measurements ADD CONSTRAINT slo_measurements_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.sre_incidents ADD CONSTRAINT sre_incidents_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.staff_departments ADD CONSTRAINT staff_departments_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.student_documents ADD CONSTRAINT student_documents_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.student_results ADD CONSTRAINT student_results_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.student_transport ADD CONSTRAINT student_transport_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.student_visas ADD CONSTRAINT student_visas_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.students ADD CONSTRAINT students_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.subjects ADD CONSTRAINT subjects_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.terms ADD CONSTRAINT terms_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.test_series ADD CONSTRAINT test_series_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.test_series_results ADD CONSTRAINT test_series_results_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.timetable_entries ADD CONSTRAINT timetable_entries_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.university_courses ADD CONSTRAINT university_courses_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.university_programs ADD CONSTRAINT university_programs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.users ADD CONSTRAINT users_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.vehicle_maintenance_logs ADD CONSTRAINT vehicle_maintenance_logs_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.visitors ADD CONSTRAINT visitors_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.webhook_subscriptions ADD CONSTRAINT webhook_subscriptions_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.workflow_approval_delegations ADD CONSTRAINT workflow_approval_delegations_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.workflow_approval_events ADD CONSTRAINT workflow_approval_events_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.workflow_approval_requests ADD CONSTRAINT workflow_approval_requests_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.workflow_approval_reviews ADD CONSTRAINT workflow_approval_reviews_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.workflows ADD CONSTRAINT workflows_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.ai_token_logs ADD CONSTRAINT ai_token_logs_scope_fk FOREIGN KEY (tenant_id, company_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.grade_subjects ADD CONSTRAINT grade_subjects_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.fee_components ADD CONSTRAINT fee_components_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.stops ADD CONSTRAINT stops_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.exam_schedules ADD CONSTRAINT exam_schedules_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_values ADD CONSTRAINT metadata_values_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.grading_rubrics ADD CONSTRAINT grading_rubrics_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_fields ADD CONSTRAINT metadata_fields_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.metadata_layouts ADD CONSTRAINT metadata_layouts_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_permissions ADD CONSTRAINT field_permissions_scope_fk FOREIGN KEY (school_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
