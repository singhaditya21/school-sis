-- Seed the Staff Profile (Teacher) Object
INSERT INTO metadata_objects (id, name, api_name, table_name, is_custom, description)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'Staff',
    'staff',
    'staff_profiles',
    false,
    'Standard system object representing teachers and administration staff'
) ON CONFLICT (tenant_id, api_name) DO NOTHING;

-- Seed Standard Fields for Staff
INSERT INTO metadata_fields (object_id, label, api_name, data_type, is_custom, is_required)
VALUES 
    ('00000000-0000-0000-0000-000000000002', 'First Name', 'first_name', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000002', 'Last Name', 'last_name', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000002', 'Employee ID', 'employee_id', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000002', 'Designation ID', 'designation_id', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000002', 'Joining Date', 'joining_date', 'DATE', false, true)
ON CONFLICT (object_id, api_name) DO NOTHING;


-- Seed the Invoice Object
INSERT INTO metadata_objects (id, name, api_name, table_name, is_custom, description)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'Invoice',
    'invoice',
    'invoices',
    false,
    'Standard system object representing student fee invoices'
) ON CONFLICT (tenant_id, api_name) DO NOTHING;

-- Seed Standard Fields for Invoice
INSERT INTO metadata_fields (object_id, label, api_name, data_type, is_custom, is_required)
VALUES 
    ('00000000-0000-0000-0000-000000000003', 'Invoice Number', 'invoice_number', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000003', 'Student ID', 'student_id', 'TEXT', false, true),
    ('00000000-0000-0000-0000-000000000003', 'Total Amount', 'total_amount', 'NUMBER', false, true),
    ('00000000-0000-0000-0000-000000000003', 'Paid Amount', 'paid_amount', 'NUMBER', false, false),
    ('00000000-0000-0000-0000-000000000003', 'Due Date', 'due_date', 'DATE', false, true),
    ('00000000-0000-0000-0000-000000000003', 'Status', 'status', 'PICKLIST', false, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- Update Picklist options for Invoice status
UPDATE metadata_fields 
SET picklist_options = '["DRAFT", "ISSUED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]'::jsonb 
WHERE api_name = 'status' AND object_id = '00000000-0000-0000-0000-000000000003';
