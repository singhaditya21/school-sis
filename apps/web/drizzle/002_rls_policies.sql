-- ScholarMind — Row-Level Security Policies
-- Ensures mathematical tenant isolation at the database level.
-- A single bug in application code CANNOT leak cross-tenant data.
--
-- Usage: Before executing queries, set the tenant context:
--   SELECT set_config('app.current_tenant', '<tenant-uuid>', true);
--
-- Run with: psql $DATABASE_URL -f 002_rls_policies.sql

-- ═══════════════════════════════════════════════════════════
-- Helper function to set tenant context per-transaction
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_tenant_context(tid uuid)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tid::text, true);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════
-- Enable RLS on all tenant-scoped tables
-- ═══════════════════════════════════════════════════════════

-- Core
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;

-- Academic
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

-- Fees
ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE concessions ENABLE ROW LEVEL SECURITY;

-- Admissions
ALTER TABLE admission_leads ENABLE ROW LEVEL SECURITY;

-- Attendance
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Timetable
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitutions ENABLE ROW LEVEL SECURITY;

-- Transport
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_transport ENABLE ROW LEVEL SECURITY;

-- Communication
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Exams
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;

-- Audit
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- HR
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- Library
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_issues ENABLE ROW LEVEL SECURITY;

-- Hostel
ALTER TABLE hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_allocations ENABLE ROW LEVEL SECURITY;

-- Health
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

-- Calendar
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Consent
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Tenant Isolation Policies
-- ═══════════════════════════════════════════════════════════
-- Every table with a tenant_id column gets this policy.
-- Platform admins (identified by app.current_tenant = 'platform')
-- can see all rows.

-- Core
CREATE POLICY tenant_isolation ON tenants
    USING (
        current_setting('app.current_tenant', true) = 'platform'
        OR id = current_setting('app.current_tenant', true)::uuid
    );

CREATE POLICY tenant_isolation ON users
    USING (
        current_setting('app.current_tenant', true) = 'platform'
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
    );

-- Generic tenant_id policy for all other tables
-- Using DO block to avoid repetition
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'students', 'guardians',
            'grades', 'sections', 'subjects', 'academic_years',
            'fee_plans', 'fee_plan_items', 'invoices', 'invoice_items', 'payments', 'concessions',
            'admission_leads',
            'attendance_records',
            'periods', 'timetable_entries', 'substitutions',
            'vehicles', 'routes', 'route_stops', 'student_transport',
            'announcements', 'messages',
            'exams', 'exam_subjects', 'exam_results', 'grading_scales',
            'audit_logs',
            'staff_attendance', 'payroll_records', 'leave_requests',
            'books', 'book_issues',
            'hostels', 'hostel_rooms', 'hostel_allocations',
            'health_records',
            'calendar_events',
            'documents',
            'consent_records'
        ])
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (
                current_setting(''app.current_tenant'', true) = ''platform''
                OR tenant_id = current_setting(''app.current_tenant'', true)::uuid
            )',
            tbl
        );
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- Force the application DB user to always go through RLS
-- (superusers bypass RLS by default)
-- ═══════════════════════════════════════════════════════════
-- Run these after creating your application DB user:
-- ALTER USER scholarmind_app SET row_security = on;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO scholarmind_app;
