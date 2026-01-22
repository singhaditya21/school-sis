-- V6__create_grading_schemes.sql
-- Grading schemes for exam evaluation (CBSE/ICSE/State Board)

-- Grading schemes master table
CREATE TABLE grading_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PERCENTAGE', 'GPA', 'CGPA', 'LETTER')),
    description TEXT,
    "isDefault" BOOLEAN DEFAULT FALSE,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_grading_scheme_name UNIQUE("tenantId", name)
);

-- Grade thresholds for each scheme
CREATE TABLE grade_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "schemeId" UUID NOT NULL REFERENCES grading_schemes(id) ON DELETE CASCADE,
    "minPercentage" DECIMAL(5,2) NOT NULL,
    "maxPercentage" DECIMAL(5,2) NOT NULL,
    grade VARCHAR(10) NOT NULL,
    "gradePoint" DECIMAL(3,1),
    remark VARCHAR(100),
    "displayOrder" INTEGER DEFAULT 0,
    CONSTRAINT chk_percentage_range CHECK ("minPercentage" >= 0 AND "maxPercentage" <= 100),
    CONSTRAINT chk_percentage_order CHECK ("minPercentage" <= "maxPercentage")
);

-- Add verification columns to student_marks if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_marks') THEN
        ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS "verifiedBy" UUID;
        ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE;
        ALTER TABLE student_marks ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';
    END IF;
END $$;

-- Indexes
CREATE INDEX idx_grading_schemes_tenant ON grading_schemes("tenantId");
CREATE INDEX idx_grading_schemes_active ON grading_schemes("tenantId", "isActive");
CREATE INDEX idx_grade_thresholds_scheme ON grade_thresholds("schemeId");

-- Insert default CBSE grading scheme
INSERT INTO grading_schemes (id, "tenantId", name, type, description, "isDefault") VALUES
    ('00000000-0000-0000-0000-000000000001', '35f4faf8-6d92-456e-9c6b-af6a6970462c', 'CBSE 9-Point Scale', 'GPA', 'Standard CBSE grading scheme for Classes 9-12', true);

-- Insert CBSE grade thresholds
INSERT INTO grade_thresholds ("schemeId", "minPercentage", "maxPercentage", grade, "gradePoint", remark, "displayOrder") VALUES
    ('00000000-0000-0000-0000-000000000001', 91, 100, 'A1', 10.0, 'Outstanding', 1),
    ('00000000-0000-0000-0000-000000000001', 81, 90, 'A2', 9.0, 'Excellent', 2),
    ('00000000-0000-0000-0000-000000000001', 71, 80, 'B1', 8.0, 'Very Good', 3),
    ('00000000-0000-0000-0000-000000000001', 61, 70, 'B2', 7.0, 'Good', 4),
    ('00000000-0000-0000-0000-000000000001', 51, 60, 'C1', 6.0, 'Above Average', 5),
    ('00000000-0000-0000-0000-000000000001', 41, 50, 'C2', 5.0, 'Average', 6),
    ('00000000-0000-0000-0000-000000000001', 33, 40, 'D', 4.0, 'Below Average', 7),
    ('00000000-0000-0000-0000-000000000001', 0, 32, 'E', 0.0, 'Needs Improvement', 8);

COMMENT ON TABLE grading_schemes IS 'Grading schemes for exam evaluation (CBSE, ICSE, State Board)';
COMMENT ON TABLE grade_thresholds IS 'Grade thresholds with percentages and grade points for each scheme';
