-- Expand-only RLS tenant_id and high-traffic foreign-key index migration (Audit M-01).
-- Every statement uses IF NOT EXISTS so replay and branch reconciliation are idempotent.
CREATE INDEX IF NOT EXISTS "idx_academic_years_tenant_id" ON "academic_years" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grades_tenant_id" ON "grades" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sections_tenant_grade" ON "sections" ("tenant_id", "grade_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subjects_tenant_id" ON "subjects" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_terms_tenant_id" ON "terms" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_concessions_tenant_id" ON "concessions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_plans_tenant_id" ON "fee_plans" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fine_rules_tenant_id" ON "fine_rules" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admission_applications_tenant_id" ON "admission_applications" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admission_documents_tenant_id" ON "admission_documents" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admission_leads_tenant_id" ON "admission_leads" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_periods_tenant_id" ON "periods" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_substitution_requests_tenant_id" ON "substitution_requests" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_substitutions_tenant_id" ON "substitutions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_timetable_entries_tenant_id" ON "timetable_entries" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_driver_background_checks_tenant_id" ON "driver_background_checks" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_gps_pings_tenant_id" ON "live_gps_pings" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_tenant_id" ON "routes" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_transport_tenant_id" ON "student_transport" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicle_maintenance_logs_tenant_id" ON "vehicle_maintenance_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_tenant_id" ON "vehicles" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consents_tenant_id" ON "consents" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_tenant_id" ON "messages" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_logs_tenant_id" ON "exam_proctoring_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_result_hashes_tenant_id" ON "exam_result_hashes" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_tenant_id" ON "exams" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_schedules_tenant_exam" ON "exam_schedules" ("tenant_id", "exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_results_tenant_student" ON "student_results" ("tenant_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_results_exam_schedule" ON "student_results" ("exam_schedule_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_created_at" ON "audit_logs" ("tenant_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_designations_tenant_id" ON "designations" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_policies_tenant_id" ON "leave_policies" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_requests_tenant_id" ON "leave_requests" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_departments_tenant_id" ON "staff_departments" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_issues_tenant_id" ON "book_issues" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_reservations_tenant_id" ON "book_reservations" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_tenant_id" ON "books" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_subscriptions_tenant_id" ON "webhook_subscriptions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hostel_allocations_tenant_id" ON "hostel_allocations" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hostel_fees_tenant_id" ON "hostel_fees" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hostel_rooms_tenant_id" ON "hostel_rooms" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hostels_tenant_id" ON "hostels" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mess_menus_tenant_id" ON "mess_menus" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_tenant_id" ON "assets" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consumables_tenant_id" ON "consumables" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_alerts_tenant_id" ON "stock_alerts" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visitors_tenant_id" ON "visitors" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_health_incidents_tenant_id" ON "health_incidents" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_health_records_tenant_id" ON "health_records" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_immunizations_tenant_id" ON "immunizations" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medication_schedules_tenant_id" ON "medication_schedules" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nurse_visit_logs_tenant_id" ON "nurse_visit_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_academic_events_tenant_id" ON "academic_events" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_attempts_tenant_id" ON "quiz_attempts" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_questions_tenant_id" ON "quiz_questions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quizzes_tenant_id" ON "quizzes" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_homework_assignments_tenant_id" ON "homework_assignments" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_homework_submissions_tenant_id" ON "homework_submissions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lesson_plans_tenant_id" ON "lesson_plans" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_certificate_templates_tenant_id" ON "certificate_templates" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_digilocker_sync_logs_tenant_id" ON "digilocker_sync_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_id_cards_tenant_id" ON "id_cards" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issued_certificates_tenant_id" ON "issued_certificates" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alumni_events_tenant_id" ON "alumni_events" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alumni_profiles_tenant_id" ON "alumni_profiles" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alumni_registrations_tenant_id" ON "alumni_registrations" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_message_logs_tenant_id" ON "message_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_message_templates_tenant_id" ON "message_templates" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consent_forms_tenant_id" ON "consent_forms" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consent_responses_tenant_id" ON "consent_responses" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_workflows_tenant_id" ON "metadata_workflows" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_documents_tenant_id" ON "student_documents" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_records_tenant_object_created" ON "metadata_records" ("tenant_id", "object_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_values_record_id" ON "metadata_values" ("record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_values_field_id" ON "metadata_values" ("field_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_fields_object_id" ON "metadata_fields" ("object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_layouts_object_id" ON "metadata_layouts" ("object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_field_permissions_field_id" ON "field_permissions" ("field_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_faculty_workload_tenant_id" ON "faculty_workload" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_university_courses_tenant_id" ON "university_courses" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_university_programs_tenant_id" ON "university_programs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coaching_batches_tenant_id" ON "coaching_batches" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_series_tenant_id" ON "test_series" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_series_results_tenant_id" ON "test_series_results" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_multi_campus_hierarchy_tenant_id" ON "multi_campus_hierarchy" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_host_families_tenant_id" ON "host_families" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_international_placements_tenant_id" ON "international_placements" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_token_logs_tenant_id" ON "ai_token_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grading_scales_tenant_id" ON "grading_scales" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_tenant_id" ON "appointments" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diary_entries_tenant_id" ON "diary_entries" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_tenant_student" ON "invoices" ("tenant_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_tenant_invoice" ON "payments" ("tenant_id", "invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_records_tenant_student_date" ON "attendance_records" ("tenant_id", "student_id", "date" DESC);
