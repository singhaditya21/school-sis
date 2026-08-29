-- Stage 4 (NOT NULL, phase 1 of 2): expand — add NOT-VALID presence CHECKs.
-- Custom migration (drizzle cannot express NOT VALID). ADDITIVE ONLY (ADD CONSTRAINT
-- ... NOT VALID) → auto-applied by the release, no destructive marker, fully
-- reversible (DROP CONSTRAINT). Each CHECK is NOT VALID so it takes only a brief
-- lock and does NOT scan on add; existing rows are proven online, out of band, by
-- `pnpm --filter @school-sis/web db:validate:notnull` (VALIDATE CONSTRAINT, SHARE
-- UPDATE EXCLUSIVE — no read/write lockout). Phase 2 (0009) then SET NOT NULL using
-- the validated CHECK to skip the table scan, and drops these CHECKs.
--
-- DEPLOY ORDERING: harmless to deploy anytime (NOT VALID never blocks writes beyond
-- the presence rule, and every scoped row was backfilled in Stage 2). Run the
-- out-of-band VALIDATE on the target BEFORE 0009 is applied.
--
-- Scope (derived from the live post-Stage-3 catalog): the 109 tables whose tenant_id
-- is NOT NULL (owner_id + group_id both present), plus the tier — companies(owner_id),
-- tenants(owner_id, company_id) — and ai_token_logs(owner_id, no group_id). Excluded:
-- the 17 nullable-tenant platform tables, the 9 school_id-scoped join tables (deferred
-- with the Stage 5 leaf rename; MATCH FULL still permits their all-null global rows),
-- and group_policies (group_id already NOT NULL).
--> statement-breakpoint
ALTER TABLE "academic_events" ADD CONSTRAINT "academic_events_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "agent_audit_logs" ADD CONSTRAINT "agent_audit_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "alumni_events" ADD CONSTRAINT "alumni_events_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD CONSTRAINT "alumni_profiles_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "alumni_registrations" ADD CONSTRAINT "alumni_registrations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "book_issues" ADD CONSTRAINT "book_issues_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "book_reservations" ADD CONSTRAINT "book_reservations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "coaching_batches" ADD CONSTRAINT "coaching_batches_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "consent_responses" ADD CONSTRAINT "consent_responses_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "digilocker_sync_logs" ADD CONSTRAINT "digilocker_sync_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "driver_background_checks" ADD CONSTRAINT "driver_background_checks_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "exam_proctoring_logs" ADD CONSTRAINT "exam_proctoring_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "exam_result_hashes" ADD CONSTRAINT "exam_result_hashes_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "faculty_workload" ADD CONSTRAINT "faculty_workload_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "hardware_tokens" ADD CONSTRAINT "hardware_tokens_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "health_incidents" ADD CONSTRAINT "health_incidents_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "host_families" ADD CONSTRAINT "host_families_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "hostel_fees" ADD CONSTRAINT "hostel_fees_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "id_cards" ADD CONSTRAINT "id_cards_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "integration_audit_logs" ADD CONSTRAINT "integration_audit_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "international_placements" ADD CONSTRAINT "international_placements_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "live_gps_pings" ADD CONSTRAINT "live_gps_pings_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "mess_menus" ADD CONSTRAINT "mess_menus_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "metadata_migration_jobs" ADD CONSTRAINT "metadata_migration_jobs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "metadata_records" ADD CONSTRAINT "metadata_records_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "metadata_workflows" ADD CONSTRAINT "metadata_workflows_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "notification_delivery_events" ADD CONSTRAINT "notification_delivery_events_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "nurse_visit_logs" ADD CONSTRAINT "nurse_visit_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "staff_departments" ADD CONSTRAINT "staff_departments_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "student_visas" ADD CONSTRAINT "student_visas_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "substitution_requests" ADD CONSTRAINT "substitution_requests_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "test_series" ADD CONSTRAINT "test_series_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "test_series_results" ADD CONSTRAINT "test_series_results_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "university_courses" ADD CONSTRAINT "university_courses_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "vehicle_maintenance_logs" ADD CONSTRAINT "vehicle_maintenance_logs_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "workflow_approval_delegations" ADD CONSTRAINT "workflow_approval_delegations_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "workflow_approval_events" ADD CONSTRAINT "workflow_approval_events_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" ADD CONSTRAINT "workflow_approval_requests_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "workflow_approval_reviews" ADD CONSTRAINT "workflow_approval_reviews_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_scope_present" CHECK ("owner_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_scope_present" CHECK ("owner_id" IS NOT NULL AND "company_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "ai_token_logs" ADD CONSTRAINT "ai_token_logs_scope_present" CHECK ("owner_id" IS NOT NULL) NOT VALID;
