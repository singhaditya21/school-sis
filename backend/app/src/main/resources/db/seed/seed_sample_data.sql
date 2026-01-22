-- Comprehensive Sample Data Seed Script
-- Classes 1-12, Sections A-F, 60 students per section = 4,320 students
-- Run this script against PostgreSQL to populate the database

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Default tenant ID
DO $$
DECLARE
  tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  academic_year_id UUID := 'a1000000-0000-0000-0000-000000000001';
  
  -- Name arrays
  boy_first_names TEXT[] := ARRAY['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 
    'Krishna', 'Ishaan', 'Shaurya', 'Atharva', 'Advik', 'Pranav', 'Advaith', 'Aarush',
    'Dhruv', 'Kabir', 'Ritvik', 'Arnav', 'Yuvan', 'Vedant', 'Lakshya', 'Rudra',
    'Parth', 'Harsh', 'Yash', 'Rohan', 'Karan', 'Ansh', 'Madhav', 'Shivansh',
    'Darsh', 'Anirudh', 'Tanmay', 'Rishi', 'Sahil', 'Prateek', 'Siddharth', 'Aryan'];
    
  girl_first_names TEXT[] := ARRAY['Aadhya', 'Ananya', 'Aanya', 'Saanvi', 'Pari', 'Anika', 'Myra', 'Sara',
    'Isha', 'Diya', 'Prisha', 'Navya', 'Aditi', 'Kiara', 'Riya', 'Kavya',
    'Avni', 'Aaradhya', 'Shanaya', 'Tara', 'Nisha', 'Pooja', 'Sneha', 'Shreya',
    'Divya', 'Kriti', 'Anjali', 'Neha', 'Ankita', 'Priya', 'Simran', 'Tanvi'];
  
  last_names TEXT[] := ARRAY['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Rao',
    'Nair', 'Menon', 'Agarwal', 'Jain', 'Chopra', 'Malhotra', 'Kapoor', 'Mehta',
    'Shah', 'Desai', 'Joshi', 'Kulkarni', 'Banerjee', 'Mukherjee', 'Das', 'Roy',
    'Saxena', 'Srivastava', 'Tiwari', 'Pandey', 'Shukla', 'Mishra', 'Tripathi', 'Dubey'];
  
  father_names TEXT[] := ARRAY['Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Vinod', 'Anil', 'Sunil', 'Ravi',
    'Vijay', 'Sanjay', 'Ajay', 'Pramod', 'Arun', 'Vikas', 'Sandeep', 'Deepak'];
  
  mother_names TEXT[] := ARRAY['Sunita', 'Anita', 'Kavita', 'Rekha', 'Meena', 'Neha', 'Geeta', 'Seema',
    'Renu', 'Poonam', 'Jyoti', 'Shanti', 'Usha', 'Nirmala', 'Priya', 'Archana'];
  
  blood_groups TEXT[] := ARRAY['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  sections TEXT[] := ARRAY['A', 'B', 'C', 'D', 'E', 'F'];
  
  class_num INT;
  section_name TEXT;
  class_id UUID;
  student_id UUID;
  guardian_id UUID;
  invoice_id UUID;
  i INT;
  seq INT := 1;
  birth_year INT;
  first_name TEXT;
  last_name TEXT;
  is_boy BOOLEAN;
  fee_amount NUMERIC;
  is_paid BOOLEAN;
  
BEGIN
  -- Create Academic Year
  INSERT INTO academic_years (id, "tenantId", name, "startDate", "endDate", "isCurrent")
  VALUES (academic_year_id, tenant_id, '2025-26', '2025-04-01', '2026-03-31', true)
  ON CONFLICT (id) DO NOTHING;
  
  RAISE NOTICE 'Created academic year 2025-26';
  
  -- Create Classes (1-12) with Sections (A-F)
  FOR class_num IN 1..12 LOOP
    FOREACH section_name IN ARRAY sections LOOP
      class_id := uuid_generate_v4();
      
      INSERT INTO class_groups (id, "tenantId", name, "academicYearId", capacity, "createdAt", "updatedAt")
      VALUES (
        class_id,
        tenant_id,
        'Class ' || class_num || '-' || section_name,
        academic_year_id,
        60,
        NOW(),
        NOW()
      ) ON CONFLICT DO NOTHING;
      
      -- Create 60 students per section
      FOR i IN 1..60 LOOP
        student_id := uuid_generate_v4();
        guardian_id := uuid_generate_v4();
        invoice_id := uuid_generate_v4();
        
        -- Randomize gender
        is_boy := random() > 0.5;
        
        -- Select names
        IF is_boy THEN
          first_name := boy_first_names[1 + floor(random() * array_length(boy_first_names, 1))::int];
        ELSE
          first_name := girl_first_names[1 + floor(random() * array_length(girl_first_names, 1))::int];
        END IF;
        
        last_name := last_names[1 + floor(random() * array_length(last_names, 1))::int];
        birth_year := 2026 - class_num - 5 - floor(random() * 2)::int;
        fee_amount := 15000 + (class_num * 2000);
        is_paid := random() > 0.15;
        
        -- Insert Student
        INSERT INTO students (
          id, "tenantId", "admissionNumber", "firstName", "lastName", 
          "dateOfBirth", gender, "enrollmentDate", "isActive", 
          "classGroupId", "createdAt", "updatedAt"
        ) VALUES (
          student_id,
          tenant_id,
          'GWD' || (2025 - floor(class_num / 2)::int) || lpad(seq::text, 5, '0'),
          first_name,
          last_name,
          make_date(birth_year, 1 + floor(random() * 12)::int, 1 + floor(random() * 28)::int),
          CASE WHEN is_boy THEN 'MALE' ELSE 'FEMALE' END,
          '2025-04-01',
          true,
          class_id,
          NOW(),
          NOW()
        );
        
        -- Insert Guardian (Father)
        INSERT INTO guardians (
          id, "tenantId", "firstName", "lastName", relationship,
          phone, email, "createdAt", "updatedAt"
        ) VALUES (
          guardian_id,
          tenant_id,
          father_names[1 + floor(random() * array_length(father_names, 1))::int],
          last_name,
          'FATHER',
          '9' || lpad((floor(random() * 1000000000)::bigint)::text, 9, '0'),
          lower(first_name) || '.' || lower(last_name) || floor(random() * 100)::int || '@gmail.com',
          NOW(),
          NOW()
        );
        
        -- Link guardian to student
        INSERT INTO _student_guardians ("A", "B")
        VALUES (guardian_id, student_id)
        ON CONFLICT DO NOTHING;
        
        -- Insert Invoice
        INSERT INTO invoices (
          id, "tenantId", "studentId", "invoiceNumber",
          "dueDate", "totalAmount", "paidAmount", status,
          "createdAt", "updatedAt"
        ) VALUES (
          invoice_id,
          tenant_id,
          student_id,
          'INV-2025-' || lpad(seq::text, 5, '0'),
          '2025-04-15',
          fee_amount,
          CASE WHEN is_paid THEN fee_amount ELSE (fee_amount * random() * 0.5) END,
          CASE WHEN is_paid THEN 'PAID' ELSE 'PENDING' END,
          NOW(),
          NOW()
        );
        
        seq := seq + 1;
      END LOOP;
      
    END LOOP;
    RAISE NOTICE 'Completed Class %', class_num;
  END LOOP;
  
  RAISE NOTICE 'Total students created: %', seq - 1;
END $$;

-- Verify data
SELECT 
  'Classes' as entity, COUNT(*) as count FROM class_groups
UNION ALL
SELECT 
  'Students' as entity, COUNT(*) as count FROM students
UNION ALL
SELECT 
  'Guardians' as entity, COUNT(*) as count FROM guardians
UNION ALL
SELECT 
  'Invoices' as entity, COUNT(*) as count FROM invoices;
