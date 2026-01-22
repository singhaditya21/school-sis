-- Comprehensive Sample Data Generation Script
-- Classes 1-12, Sections A-F, 60 students per section = 4,320 students
-- Generated with realistic Indian names and data

-- Clear existing data (in order of dependencies)
TRUNCATE TABLE attendance CASCADE;
TRUNCATE TABLE marks CASCADE;
TRUNCATE TABLE health_records CASCADE;
TRUNCATE TABLE invoices CASCADE;
TRUNCATE TABLE payments CASCADE;
TRUNCATE TABLE students CASCADE;
TRUNCATE TABLE guardians CASCADE;
TRUNCATE TABLE class_groups CASCADE;
TRUNCATE TABLE subjects CASCADE;
TRUNCATE TABLE exams CASCADE;

-- Insert Academic Year
INSERT INTO academic_years (id, "tenantId", name, "startDate", "endDate", "isCurrent")
VALUES 
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2025-26', '2025-04-01', '2026-03-31', true)
ON CONFLICT (id) DO NOTHING;

-- Insert Class Groups (Classes 1-12, Sections A-F)
DO $$
DECLARE
  class_num INT;
  section CHAR;
  sections CHAR[] := ARRAY['A', 'B', 'C', 'D', 'E', 'F'];
  class_id UUID;
BEGIN
  FOR class_num IN 1..12 LOOP
    FOREACH section IN ARRAY sections LOOP
      class_id := uuid_generate_v4();
      INSERT INTO class_groups (id, "tenantId", name, grade, section, "academicYearId", capacity)
      VALUES (
        class_id,
        '00000000-0000-0000-0000-000000000001',
        'Class ' || class_num || '-' || section,
        class_num,
        section,
        'a1000000-0000-0000-0000-000000000001',
        60
      );
    END LOOP;
  END LOOP;
END $$;

-- Insert Subjects (common across all classes)
INSERT INTO subjects (id, "tenantId", name, code, type) VALUES
  ('s1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'English', 'ENG', 'SCHOLASTIC'),
  ('s1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Hindi', 'HIN', 'SCHOLASTIC'),
  ('s1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mathematics', 'MAT', 'SCHOLASTIC'),
  ('s1000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Science', 'SCI', 'SCHOLASTIC'),
  ('s1000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Social Science', 'SST', 'SCHOLASTIC'),
  ('s1000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Computer Science', 'CS', 'SCHOLASTIC'),
  ('s1000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Physical Education', 'PE', 'CO_SCHOLASTIC'),
  ('s1000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Art', 'ART', 'CO_SCHOLASTIC')
ON CONFLICT DO NOTHING;

-- Insert Exams
INSERT INTO exams (id, "tenantId", name, type, "startDate", "endDate", "academicYearId", status) VALUES
  ('e1000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Term 1 Examination', 'TERM', '2025-09-15', '2025-09-30', 'a1000000-0000-0000-0000-000000000001', 'COMPLETED'),
  ('e1000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mid-Term Assessment', 'MIDTERM', '2025-12-01', '2025-12-15', 'a1000000-0000-0000-0000-000000000001', 'SCHEDULED'),
  ('e1000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Term 2 Examination', 'TERM', '2026-03-01', '2026-03-15', 'a1000000-0000-0000-0000-000000000001', 'SCHEDULED')
ON CONFLICT DO NOTHING;
