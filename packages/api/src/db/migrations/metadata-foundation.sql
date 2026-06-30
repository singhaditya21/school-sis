-- metadata_objects: Defines the core objects (entities) in the system
CREATE TABLE IF NOT EXISTS metadata_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system-wide default objects
    name VARCHAR(100) NOT NULL, -- e.g., 'Student', 'Invoice'
    api_name VARCHAR(100) NOT NULL, -- e.g., 'student', 'invoice'
    table_name VARCHAR(100) NOT NULL, -- e.g., 'students', 'invoices' (where the data is actually stored)
    description TEXT,
    is_custom BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, api_name)
);

-- metadata_fields: Defines standard and custom fields for an object
CREATE TABLE IF NOT EXISTS metadata_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES metadata_objects(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL, -- e.g., 'Medical Allergies'
    api_name VARCHAR(255) NOT NULL, -- e.g., 'medical_allergies_c'
    data_type VARCHAR(50) NOT NULL, -- 'TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'PICKLIST'
    is_custom BOOLEAN DEFAULT false,
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    picklist_options JSONB DEFAULT '[]'::jsonb, -- Array of strings if type is PICKLIST
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(object_id, api_name)
);

-- metadata_layouts: Defines the UI layout JSON schemas for forms and lists
CREATE TABLE IF NOT EXISTS metadata_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES metadata_objects(id) ON DELETE CASCADE,
    layout_type VARCHAR(50) NOT NULL, -- 'FORM', 'LIST'
    schema JSONB NOT NULL DEFAULT '{}'::jsonb, -- The react-hook-form / DataTable schema
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- field_permissions: Role-Based Access Control for individual fields
CREATE TABLE IF NOT EXISTS field_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES metadata_fields(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'ADMIN', 'TEACHER', 'PARENT'
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(field_id, role)
);

-- Add custom_data JSONB column to standard tables if they don't exist
ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meta_obj_api ON metadata_objects(tenant_id, api_name);
CREATE INDEX IF NOT EXISTS idx_meta_fld_obj ON metadata_fields(object_id);
CREATE INDEX IF NOT EXISTS idx_students_custom_data ON students USING GIN (custom_data);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_custom_data ON staff_profiles USING GIN (custom_data);
CREATE INDEX IF NOT EXISTS idx_invoices_custom_data ON invoices USING GIN (custom_data);
