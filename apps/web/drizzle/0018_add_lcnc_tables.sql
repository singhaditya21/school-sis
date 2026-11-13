-- Expand-only LCNC Platform Architecture migration (6 Pillars):
-- 1. System Object per-tenant activation (`tenant_object_settings`) + `custom_data` JSONB across all 19 System Objects
-- 2. Custom Tenant Roles & Permissions (`tenant_roles`, `tenant_role_permissions`, `users.custom_role_id`)
-- 3. Named Multi-Form & Role-Scoped Layouts + Object Home Layouts (`metadata_layouts.name`, `assigned_roles`, `updated_at`)
-- 4. Persistent Categorized Views (`metadata_view_categories`, `metadata_views`)
-- 5. Categorized Custom & BI Reports (`report_categories`, `bi_report_definitions` extensions)
-- 6. Seed all 19 Core System Objects + Standard Fields for out-of-the-box Tenant-Admin LCNC

CREATE TABLE IF NOT EXISTS "tenant_object_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "uq_tenant_object_settings_tenant_api" UNIQUE("tenant_id", "object_api_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_roles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "code" varchar(80) NOT NULL,
    "name" varchar(120) NOT NULL,
    "description" text,
    "base_role" varchar(50) DEFAULT 'TEACHER' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "uq_tenant_roles_tenant_code" UNIQUE("tenant_id", "code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_role_permissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "role_id" uuid NOT NULL REFERENCES "tenant_roles"("id") ON DELETE CASCADE,
    "permission" varchar(160) NOT NULL,
    "resource" varchar(100) NOT NULL,
    "action" varchar(60) NOT NULL,
    "scope" varchar(40) DEFAULT 'tenant' NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "uq_tenant_role_permissions_role_perm" UNIQUE("role_id", "permission")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_view_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100),
    "name" varchar(120) NOT NULL,
    "description" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "category_id" uuid REFERENCES "metadata_view_categories"("id") ON DELETE SET NULL,
    "name" varchar(120) NOT NULL,
    "columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "filter_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "sort_field" varchar(100),
    "sort_direction" varchar(10) DEFAULT 'DESC' NOT NULL,
    "display_mode" varchar(20) DEFAULT 'TABLE' NOT NULL,
    "kanban_group_field" varchar(100),
    "is_default" boolean DEFAULT false NOT NULL,
    "visibility" varchar(20) DEFAULT 'SHARED' NOT NULL,
    "allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" varchar(120) NOT NULL,
    "description" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_role_id" uuid REFERENCES "tenant_roles"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "metadata_layouts" ADD COLUMN IF NOT EXISTS "name" varchar(120) DEFAULT 'Default Layout' NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_layouts" ADD COLUMN IF NOT EXISTS "assigned_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_layouts" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "report_categories"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ADD COLUMN IF NOT EXISTS "object_api_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ADD COLUMN IF NOT EXISTS "report_kind" varchar(30) DEFAULT 'STANDARD_BI' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ADD COLUMN IF NOT EXISTS "chart_type" varchar(30) DEFAULT 'TABLE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bi_report_definitions" ADD COLUMN IF NOT EXISTS "allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "concessions" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "concessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "hostels" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now();
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "custom_data" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_roles_tenant" ON "tenant_roles" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_role_permissions_tenant_role" ON "tenant_role_permissions" ("tenant_id", "role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_views_tenant_object" ON "metadata_views" ("tenant_id", "object_api_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_view_cats_tenant_obj" ON "metadata_view_categories" ("tenant_id", "object_api_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_categories_tenant" ON "report_categories" ("tenant_id");
--> statement-breakpoint
DO $$
DECLARE
    v_obj_id uuid;
BEGIN
    -- 1. Student (students)
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'student' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Student', 'student', 'students', false, 'Enrolled student master record', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'First Name', 'first_name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Last Name', 'last_name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Admission Number', 'admission_number', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Enrollment Date', 'admission_date', 'DATE', false, true, '[]'::jsonb),
            (v_obj_id, 'Gender', 'gender', 'PICKLIST', false, false, '["Male","Female","Other"]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, false, '["ACTIVE","ALUMNI","TRANSFERRED","INACTIVE"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 2. Staff (staff_profiles)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'staff' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000002', 'Staff', 'staff', 'staff_profiles', false, 'Faculty and administrative staff profiles', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Employee ID', 'employee_id', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Employment Type', 'employment_type', 'PICKLIST', false, false, '["FULL_TIME","PART_TIME","CONTRACT","VISITING"]'::jsonb),
            (v_obj_id, 'Joining Date', 'joining_date', 'DATE', false, true, '[]'::jsonb),
            (v_obj_id, 'Qualification', 'qualification', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, false, '["ACTIVE","ON_LEAVE","RESIGNED"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 3. Invoice (invoices)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'invoice' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000003', 'Invoice', 'invoice', 'invoices', false, 'Student fee invoices with governed ledger protection', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Invoice Number', 'invoice_number', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Student ID', 'student_id', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Total Amount', 'total_amount', 'CURRENCY', false, true, '[]'::jsonb),
            (v_obj_id, 'Paid Amount', 'paid_amount', 'CURRENCY', false, false, '[]'::jsonb),
            (v_obj_id, 'Due Date', 'due_date', 'DATE', false, true, '[]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, true, '["DRAFT","ISSUED","PARTIAL","PAID","OVERDUE","CANCELLED"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 4. Guardian (guardians)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'guardian' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000004', 'Guardian', 'guardian', 'guardians', false, 'Parents and legal guardians linked to students', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'First Name', 'first_name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Last Name', 'last_name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Relation', 'relation', 'PICKLIST', false, true, '["FATHER","MOTHER","GUARDIAN","OTHER"]'::jsonb),
            (v_obj_id, 'Occupation', 'occupation', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Primary Guardian', 'is_primary', 'BOOLEAN', false, false, '[]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 5. Admission (admission_applications)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'admission' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000005', 'Admission', 'admission', 'admission_applications', false, 'Formal student admission applications', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Application Number', 'application_number', 'TEXT', false, true),
            (v_obj_id, 'Lead ID', 'lead_id', 'TEXT', false, false),
            (v_obj_id, 'Submitted Date', 'submitted_at', 'DATE', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 6. Alumni Profile (alumni_profiles)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'alumni_profile' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000006', 'Alumni Profile', 'alumni_profile', 'alumni_profiles', false, 'Graduated alumni directory and career outcomes', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Full Name', 'name', 'TEXT', false, true),
            (v_obj_id, 'Batch', 'batch', 'TEXT', false, false),
            (v_obj_id, 'Graduation Year', 'graduation_year', 'NUMBER', false, false),
            (v_obj_id, 'Current Organization', 'current_company', 'TEXT', false, false),
            (v_obj_id, 'Verified', 'is_verified', 'BOOLEAN', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 7. Class / Grade (grades)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'class' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000007', 'Class', 'class', 'grades', false, 'Academic classes and grade levels', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Class Name', 'name', 'TEXT', false, true),
            (v_obj_id, 'Numeric Level', 'numeric_value', 'NUMBER', false, false),
            (v_obj_id, 'Display Order', 'display_order', 'NUMBER', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 8. Section (sections)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'section' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000008', 'Section', 'section', 'sections', false, 'Class sections, room allocations, and homeroom capacity', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Section Name', 'name', 'TEXT', false, true),
            (v_obj_id, 'Seat Capacity', 'capacity', 'NUMBER', false, false),
            (v_obj_id, 'Room Number', 'room_number', 'TEXT', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 9. Subject (subjects)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'subject' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000009', 'Subject', 'subject', 'subjects', false, 'Curriculum subjects and elective catalog', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Subject Name', 'name', 'TEXT', false, true),
            (v_obj_id, 'Subject Code', 'code', 'TEXT', false, true),
            (v_obj_id, 'Description', 'description', 'TEXT', false, false),
            (v_obj_id, 'Elective', 'is_elective', 'BOOLEAN', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 10. Attendance Record (attendance_records)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'attendance_record' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000010', 'Attendance Record', 'attendance_record', 'attendance_records', false, 'Daily student attendance logs', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Student ID', 'student_id', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Date', 'date', 'DATE', false, true, '[]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, true, '["PRESENT","ABSENT","LATE","EXCUSED"]'::jsonb),
            (v_obj_id, 'Remarks', 'remarks', 'TEXT', false, false, '[]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 11. Exam (exams)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'exam' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000011', 'Exam', 'exam', 'exams', false, 'Term examinations, assessments, and result cycles', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Exam Name', 'name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Exam Type', 'type', 'PICKLIST', false, true, '["UNIT_TEST","MIDTERM","FINAL","PRACTICAL","MOCK"]'::jsonb),
            (v_obj_id, 'Start Date', 'start_date', 'DATE', false, false, '[]'::jsonb),
            (v_obj_id, 'End Date', 'end_date', 'DATE', false, false, '[]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, false, '["DRAFT","SCHEDULED","ONGOING","PUBLISHED"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 12. Concession (concessions)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'concession' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000012', 'Concession', 'concession', 'concessions', false, 'Fee waivers, sibling discounts, and merit concessions', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Student ID', 'student_id', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Concession Type', 'type', 'PICKLIST', false, true, '["PERCENTAGE","FLAT","SCHOLARSHIP","SIBLING","RTE"]'::jsonb),
            (v_obj_id, 'Value', 'value', 'CURRENCY', false, true, '[]'::jsonb),
            (v_obj_id, 'Reason', 'reason', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Active', 'is_active', 'BOOLEAN', false, false, '[]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 13. Route (routes)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'route' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000013', 'Route', 'route', 'routes', false, 'Campus transport bus routes and monthly tariffs', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Route Name', 'name', 'TEXT', false, true),
            (v_obj_id, 'Description', 'description', 'TEXT', false, false),
            (v_obj_id, 'Morning Departure', 'morning_departure_time', 'TEXT', false, false),
            (v_obj_id, 'Monthly Fee', 'monthly_fee', 'CURRENCY', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 14. Vehicle (vehicles)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'vehicle' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000014', 'Vehicle', 'vehicle', 'vehicles', false, 'School transport fleet, drivers, and compliance dates', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Vehicle Number', 'vehicle_number', 'TEXT', false, true),
            (v_obj_id, 'Vehicle Type', 'type', 'TEXT', false, false),
            (v_obj_id, 'Seating Capacity', 'capacity', 'NUMBER', false, false),
            (v_obj_id, 'Driver Name', 'driver_name', 'TEXT', false, false),
            (v_obj_id, 'Insurance Expiry', 'insurance_expiry', 'DATE', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 15. Hostel (hostels)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'hostel' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000015', 'Hostel', 'hostel', 'hostels', false, 'Residential boarding houses and bed capacity', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Hostel Name', 'name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Hostel Type', 'type', 'PICKLIST', false, false, '["BOYS","GIRLS","STAFF","CO_ED"]'::jsonb),
            (v_obj_id, 'Total Rooms', 'total_rooms', 'NUMBER', false, false, '[]'::jsonb),
            (v_obj_id, 'Total Beds', 'total_beds', 'NUMBER', false, false, '[]'::jsonb),
            (v_obj_id, 'Active', 'is_active', 'BOOLEAN', false, false, '[]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 16. Book (books)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'book' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000016', 'Book', 'book', 'books', false, 'Library catalog, ISBN inventory, and shelf locations', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Title', 'title', 'TEXT', false, true),
            (v_obj_id, 'Author', 'author', 'TEXT', false, true),
            (v_obj_id, 'ISBN', 'isbn', 'TEXT', false, false),
            (v_obj_id, 'Category', 'category', 'TEXT', false, false),
            (v_obj_id, 'Available Copies', 'available_copies', 'NUMBER', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 17. Visitor (visitors)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'visitor' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000017', 'Visitor', 'visitor', 'visitors', false, 'Campus gate security and visitor pass registry', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Visitor Name', 'name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Purpose', 'purpose', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Host Name', 'host_name', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Status', 'status', 'PICKLIST', false, false, '["PRE_APPROVED","CHECKED_IN","CHECKED_OUT","DENIED"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 18. Health Record (health_records)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'health_record' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000018', 'Health Record', 'health_record', 'health_records', false, 'Student infirmary, allergies, and medical profile', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required) VALUES
            (v_obj_id, 'Student ID', 'student_id', 'TEXT', false, true),
            (v_obj_id, 'Blood Group', 'blood_group', 'TEXT', false, false),
            (v_obj_id, 'Allergies', 'allergies', 'TEXT', false, false),
            (v_obj_id, 'Medical Notes', 'notes', 'TEXT', false, false)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;

    -- 19. Inventory Item (assets)
    v_obj_id := NULL;
    SELECT id INTO v_obj_id FROM public.metadata_objects WHERE tenant_id IS NULL AND api_name = 'inventory_item' LIMIT 1;
    IF v_obj_id IS NULL THEN
        INSERT INTO public.metadata_objects (id, name, api_name, table_name, is_custom, description, status)
        VALUES ('00000000-0000-0000-0000-000000000019', 'Inventory Item', 'inventory_item', 'assets', false, 'Campus fixed assets, lab equipment, and maintenance inventory', 'PUBLISHED')
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_obj_id;
    END IF;
    IF v_obj_id IS NOT NULL THEN
        INSERT INTO public.metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options) VALUES
            (v_obj_id, 'Item Name', 'name', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Category', 'category', 'TEXT', false, true, '[]'::jsonb),
            (v_obj_id, 'Serial Number', 'serial_number', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Location', 'location', 'TEXT', false, false, '[]'::jsonb),
            (v_obj_id, 'Condition', 'condition', 'PICKLIST', false, false, '["NEW","GOOD","FAIR","NEEDS_REPAIR","RETIRED"]'::jsonb)
        ON CONFLICT (object_id, api_name) DO NOTHING;
    END IF;
END $$;
