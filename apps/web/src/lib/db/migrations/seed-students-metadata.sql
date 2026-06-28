-- Seed the Student Object
INSERT INTO metadata_objects (id, name, api_name, table_name, is_custom, description)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Student',
    'student',
    'students',
    false,
    'Standard system object representing an enrolled student'
) ON CONFLICT (tenant_id, api_name) DO NOTHING;

-- Seed Standard Fields for Student
INSERT INTO metadata_fields (object_id, label, api_name, data_type, is_custom, is_required)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'First Name', 'first_name', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000001', 'Last Name', 'last_name', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000001', 'Admission Number', 'admission_number', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000001', 'Enrollment Date', 'enrollment_date', 'DATE', false, true),
    ('00000000-0000-0000-0000-000000000001', 'Gender', 'gender', 'PICKLIST', false, false),
    ('00000000-0000-0000-0000-000000000001', 'Date of Birth', 'date_of_birth', 'DATE', false, false)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- Update Picklist options for gender
UPDATE metadata_fields 
SET picklist_options = '["Male", "Female", "Other"]'::jsonb 
WHERE api_name = 'gender' AND object_id = '00000000-0000-0000-0000-000000000001';
