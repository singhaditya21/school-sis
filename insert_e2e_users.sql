-- Create missing tables if they don't exist
CREATE TABLE IF NOT EXISTS substitution_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    substitute_id uuid,
    section_id uuid,
    period integer NOT NULL,
    date varchar(10) NOT NULL,
    reason varchar(255),
    status varchar(50) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS diary_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title varchar(255) NOT NULL,
    content text NOT NULL,
    date varchar(10) NOT NULL,
    grade_id uuid,
    section_id uuid,
    subject_id uuid,
    teacher_id uuid,
    type varchar(50)
);

CREATE TABLE IF NOT EXISTS appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title varchar(255) NOT NULL,
    description text,
    date varchar(10) NOT NULL,
    time varchar(10) NOT NULL,
    duration integer NOT NULL,
    with_user_id uuid,
    status varchar(50) DEFAULT 'scheduled',
    type varchar(50)
);

CREATE TABLE IF NOT EXISTS hostel_fees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    fee_type varchar(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    due_date date NOT NULL,
    status varchar(50) NOT NULL,
    paid_date date
);

-- Delete existing E2E data to prevent foreign key errors (ordered by dependencies)
DELETE FROM book_issues WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM books WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM receipts WHERE receipt_number = 'PAY-2025-089';
DELETE FROM payments WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc037';
DELETE FROM invoices WHERE invoice_number IN ('INV-2026-001', 'INV-2025-089');
DELETE FROM guardians WHERE email = 'parent@schoolsis.com';
DELETE FROM users WHERE email IN ('admin@schoolsis.com', 'teacher@schoolsis.com', 'parent@schoolsis.com');

-- Insert E2E test users
INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, is_active)
VALUES 
('d5b5c928-867c-473d-88f5-1bdf3a4bc031', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'admin@schoolsis.com', '$2a$12$XTr0MBk7Hs/EvUloLtta3.FpSAs0awe9RpmIDe2e0HdN9on8xWoxa', 'Admin', 'User', 'SUPER_ADMIN', true),
('d5b5c928-867c-473d-88f5-1bdf3a4bc032', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'teacher@schoolsis.com', '$2a$12$uDesYHq8O3X4ys6T0e5zDexPYGF4gppPgX.yZDyffG3Fv2HjYa6BS', 'Teacher', 'User', 'TEACHER', true),
('d5b5c928-867c-473d-88f5-1bdf3a4bc033', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'parent@schoolsis.com', '$2a$12$e5XRMFLB/J2T2Yr0O8xQ2unEm3V3xsbKqbM/1AS1lklwrD3kSWJCa', 'Parent', 'User', 'PARENT', true);

-- Link parent to Aarav Sharma
INSERT INTO guardians (id, tenant_id, user_id, student_id, relation, first_name, last_name, email, phone, is_emergency_contact, is_primary)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc034', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc033', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
 'FATHER', 'Parent', 'User', 'parent@schoolsis.com', '9876543210', true, true);

-- Invoices for Aarav Sharma
INSERT INTO invoices (id, tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount, due_date, status, description)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc035', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
 (SELECT id FROM fee_plans LIMIT 1), 'INV-2026-001', '45000.00', '0.00', '2026-05-15', 'PENDING', 'Term 1 Fee'),
('d5b5c928-867c-473d-88f5-1bdf3a4bc036', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
 (SELECT id FROM fee_plans LIMIT 1), 'INV-2025-089', '10000.00', '10000.00', '2025-05-15', 'PAID', 'Term 0 Fee');

-- Payments
INSERT INTO payments (id, tenant_id, invoice_id, student_id, amount, method, status)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc037', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc036', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
 '10000.00', 'ONLINE', 'COMPLETED');

-- Receipts
INSERT INTO receipts (id, tenant_id, payment_id, receipt_number)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc038', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc037', 'PAY-2025-089');

-- Delete and seed E2E data
DELETE FROM substitution_requests WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM diary_entries WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM appointments WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM hostel_allocations WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM hostel_rooms WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM hostels WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
DELETE FROM hostel_fees WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

-- Insert E2E substitutions
INSERT INTO substitution_requests (id, tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
VALUES
('a5b5c928-867c-473d-88f5-1bdf3a4bc001', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 
 (SELECT id FROM users WHERE role = 'TEACHER' AND id != 'd5b5c928-867c-473d-88f5-1bdf3a4bc032' LIMIT 1),
 (SELECT id FROM sections LIMIT 1),
 1, '2026-06-27', 'Sick Leave', 'pending');

-- Insert E2E diary entries
INSERT INTO diary_entries (id, tenant_id, title, content, date, grade_id, section_id, subject_id, teacher_id, type)
VALUES
('a5b5c928-867c-473d-88f5-1bdf3a4bc002', '0c413c23-6f0f-40ab-bd41-73e6e996ff35',
 'Math Homework - Chapter 3', 'Complete problems 1 to 10 on page 45.', '2026-06-27',
 (SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1),
 (SELECT id FROM sections LIMIT 1),
 (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
 'd5b5c928-867c-473d-88f5-1bdf3a4bc032',
 'HOMEWORK');

-- Insert E2E appointments
INSERT INTO appointments (id, tenant_id, title, description, date, time, duration, with_user_id, status, type)
VALUES
('a5b5c928-867c-473d-88f5-1bdf3a4bc003', '0c413c23-6f0f-40ab-bd41-73e6e996ff35',
 'Parent Teacher Meeting', 'Discuss quarterly progress.', '2026-06-28', '10:00', 30,
 'd5b5c928-867c-473d-88f5-1bdf3a4bc032',
 'scheduled', 'PTM');

-- Insert E2E hostel data (Hostel, Room, and Allocation)
INSERT INTO hostels (id, tenant_id, name, type, total_rooms, total_beds, occupied_beds, is_active)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc060', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'Nilgiri Boys Hostel', 'BOYS', 10, 20, 1, true);

INSERT INTO hostel_rooms (id, tenant_id, hostel_id, room_number, floor, type, total_beds, occupied_beds, status)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc061', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', '101', 1, 'DOUBLE', 2, 1, 'AVAILABLE');

INSERT INTO hostel_allocations (id, tenant_id, student_id, hostel_id, room_id, bed_number, allocated_from, allocated_to, status)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc062', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'd5b5c928-867c-473d-88f5-1bdf3a4bc061', 'A', '2026-06-01', '2027-05-31', 'ACTIVE');

-- Insert E2E hostel fees
INSERT INTO hostel_fees (id, tenant_id, student_id, fee_type, amount, due_date, status, paid_date)
VALUES
((SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 'hostel', 15000.00, '2026-07-15', 'pending', NULL),
('a5b5c928-867c-473d-88f5-1bdf3a4bc005', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 'mess', 5000.00, '2026-06-15', 'paid', '2026-06-12');

-- Seed Exam, Exam Schedule and Student Results for Gradebook testing
DELETE FROM student_results WHERE exam_schedule_id IN (SELECT id FROM exam_schedules WHERE subject_id = (SELECT id FROM subjects WHERE name = 'Mathematics' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'));
DELETE FROM exam_schedules WHERE subject_id = (SELECT id FROM subjects WHERE name = 'Mathematics' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35');
DELETE FROM exams WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc050';

INSERT INTO exams (id, tenant_id, academic_year_id, name, type, start_date, end_date, description)
VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc050', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
        (SELECT id FROM academic_years WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
        'Mathematics Final', 'FINAL', '2026-06-01', '2026-06-15', 'Math Term Final');

INSERT INTO exam_schedules (id, exam_id, grade_id, subject_id, exam_date, start_time, end_time, max_marks, passing_marks)
VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc051', 'd5b5c928-867c-473d-88f5-1bdf3a4bc050', 
        (SELECT id FROM grades WHERE name = 'Grade 1' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
        (SELECT id FROM subjects WHERE name = 'Mathematics' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
        '2026-06-10', '09:00', '12:00', 100.00, 40.00);

INSERT INTO student_results (tenant_id, exam_schedule_id, student_id, marks_obtained, is_absent)
SELECT '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc051', id, 
       CASE 
         WHEN admission_number = 'GWD202500001' THEN 95.00
         WHEN admission_number = 'GWD202500002' THEN 85.00
         WHEN admission_number = 'GWD202500003' THEN 75.00
         WHEN admission_number = 'GWD202500004' THEN 65.00
         WHEN admission_number = 'GWD202500005' THEN 55.00
         WHEN admission_number = 'GWD202500006' THEN 45.00
         ELSE 80.00
       END, false
FROM students WHERE grade_id = (SELECT id FROM grades WHERE name = 'Grade 1' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1);

-- Seed Library Books and Book Issues

INSERT INTO books (id, tenant_id, title, author, isbn, publisher, year, category, total_copies, available_copies)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc070', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'Introduction to Algorithms', 'Thomas H. Cormen', '9780262033848', 'MIT Press', 2009, 'TEXTBOOK', 5, 4),
('d5b5c928-867c-473d-88f5-1bdf3a4bc071', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'The Hobbit', 'J.R.R. Tolkien', '9780261102217', 'George Allen & Unwin', 1937, 'FICTION', 3, 3);

INSERT INTO book_issues (id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, status)
VALUES
('d5b5c928-867c-473d-88f5-1bdf3a4bc072', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc070',
 'd5b5c928-867c-473d-88f5-1bdf3a4bc033', (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1),
 '2026-06-20', '2026-07-04', 'ISSUED');
