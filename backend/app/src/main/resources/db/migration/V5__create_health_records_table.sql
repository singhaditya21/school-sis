-- V5__create_health_records_table.sql
-- HPC (Health & Physical Checkup) module for CBSE compliance

CREATE TABLE health_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "checkupDate" DATE NOT NULL,
    height DECIMAL(5,2),  -- in cm
    weight DECIMAL(5,2),  -- in kg
    bmi DECIMAL(4,2),     -- calculated: weight / (height/100)^2
    "bloodGroup" VARCHAR(5),
    vision VARCHAR(100),   -- e.g., "Normal", "6/6", "Needs correction"
    dental VARCHAR(100),   -- e.g., "Normal", "Cavity detected"
    hearing VARCHAR(100),  -- e.g., "Normal", "Partial hearing loss"
    "generalHealth" TEXT,  -- Any other health notes
    notes TEXT,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_health_record_student_year UNIQUE("tenantId", "studentId", "academicYearId")
);

-- Indexes for common queries
CREATE INDEX idx_health_records_tenant_student ON health_records("tenantId", "studentId");
CREATE INDEX idx_health_records_tenant_year ON health_records("tenantId", "academicYearId");
CREATE INDEX idx_health_records_checkup_date ON health_records("tenantId", "checkupDate");

COMMENT ON TABLE health_records IS 'Student health and physical checkup records for CBSE compliance';
COMMENT ON COLUMN health_records.bmi IS 'Body Mass Index - calculated from height and weight';
