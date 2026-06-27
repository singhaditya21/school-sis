'use server';
/**
 * Consolidated detail queries for sub-pages.
 * All queries are tenant-scoped via requireAuth() middleware.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

function isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// ─── Student Detail ───────────────────────────────────────
export async function getStudentDetail(studentId: string) {
    if (!isValidUUID(studentId)) return null;
    const { tenantId } = await requireAuth('students:read');

    const { rows: students } = await pool.query(
        `SELECT 
            s.id,
            s.admission_number AS "admissionNumber",
            s.first_name AS "firstName",
            s.last_name AS "lastName",
            s.date_of_birth AS "dateOfBirth",
            s.gender,
            s.blood_group AS "bloodGroup",
            s.address,
            s.city,
            s.state,
            s.pincode,
            s.roll_number AS "rollNumber",
            s.admission_date AS "admissionDate",
            s.status,
            g.name AS "gradeName",
            sec.name AS "sectionName"
        FROM students s
        INNER JOIN grades g ON s.grade_id = g.id
        INNER JOIN sections sec ON s.section_id = sec.id
        WHERE s.id = $1 AND s.tenant_id = $2`,
        [studentId, tenantId]
    );

    if (students.length === 0) return null;
    const student = students[0];

    const { rows: guardians } = await pool.query(
        `SELECT 
            id,
            first_name AS "firstName",
            last_name AS "lastName",
            relation,
            phone,
            email,
            occupation,
            is_primary AS "isPrimary"
        FROM guardians
        WHERE student_id = $1 AND tenant_id = $2`,
        [studentId, tenantId]
    );

    return { ...student, guardians };
}

// ─── Students by Section (for attendance, timetable) ──────
export async function getStudentsBySection(sectionId: string) {
    if (!isValidUUID(sectionId)) return [];
    const { tenantId } = await requireAuth('students:read');

    const { rows } = await pool.query(
        `SELECT 
            id,
            admission_number AS "admissionNumber",
            first_name AS "firstName",
            last_name AS "lastName",
            roll_number AS "rollNumber"
        FROM students
        WHERE section_id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
        ORDER BY roll_number ASC, first_name ASC`,
        [sectionId, tenantId]
    );

    return rows;
}

// ─── Invoice Detail ───────────────────────────────────────
export async function getInvoiceDetail(invoiceId: string) {
    if (!isValidUUID(invoiceId)) return null;
    const { tenantId } = await requireAuth('fees:read');

    const { rows: invoices } = await pool.query(
        `SELECT 
            i.id,
            i.invoice_number AS "invoiceNumber",
            i.total_amount AS "totalAmount",
            i.paid_amount AS "paidAmount",
            i.due_date AS "dueDate",
            i.status,
            i.description,
            s.first_name AS "studentFirstName",
            s.last_name AS "studentLastName",
            s.id AS "studentId",
            i.fee_plan_id AS "feePlanId"
        FROM invoices i
        INNER JOIN students s ON i.student_id = s.id
        WHERE i.id = $1 AND i.tenant_id = $2`,
        [invoiceId, tenantId]
    );

    if (invoices.length === 0) return null;
    const invoice = invoices[0];

    // Get fee components (line items)
    const { rows: components } = await pool.query(
        `SELECT 
            name,
            amount,
            frequency,
            is_optional AS "isOptional"
        FROM fee_components
        WHERE fee_plan_id = $1
        ORDER BY created_at ASC`,
        [invoice.feePlanId]
    );

    // Get payments
    const { rows: payments } = await pool.query(
        `SELECT 
            id,
            amount,
            method,
            status,
            created_at AS "createdAt"
        FROM payments
        WHERE invoice_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC`,
        [invoiceId, tenantId]
    );

    return {
        ...invoice,
        studentName: `${invoice.studentFirstName} ${invoice.studentLastName}`,
        dueAmount: String(Number(invoice.totalAmount) - Number(invoice.paidAmount)),
        lineItems: components,
        payments,
    };
}

// ─── Receipt Detail ───────────────────────────────────────
export async function getReceiptDetail(receiptId: string) {
    if (!isValidUUID(receiptId)) return null;
    const { tenantId } = await requireAuth('fees:read');

    const { rows } = await pool.query(
        `SELECT 
            r.id,
            r.receipt_number AS "receiptNumber",
            p.amount,
            p.method,
            p.created_at AS "paymentDate",
            p.invoice_id AS "invoiceId",
            s.first_name AS "studentFirstName",
            s.last_name AS "studentLastName"
        FROM receipts r
        INNER JOIN payments p ON r.payment_id = p.id
        INNER JOIN invoices i ON p.invoice_id = i.id
        INNER JOIN students s ON i.student_id = s.id
        WHERE r.id = $1 AND r.tenant_id = $2`,
        [receiptId, tenantId]
    );

    return rows.length > 0 ? rows[0] : null;
}

// ─── Exam Detail ──────────────────────────────────────────
export async function getExamDetail(examId: string) {
    if (!isValidUUID(examId)) return null;
    const { tenantId } = await requireAuth('exams:read');

    const { rows: exams } = await pool.query(
        `SELECT 
            e.id,
            e.name,
            e.type,
            e.start_date AS "startDate",
            e.end_date AS "endDate",
            e.description,
            ay.name AS "academicYearName"
        FROM exams e
        INNER JOIN academic_years ay ON e.academic_year_id = ay.id
        WHERE e.id = $1 AND e.tenant_id = $2`,
        [examId, tenantId]
    );

    if (exams.length === 0) return null;
    const exam = exams[0];

    const { rows: schedules } = await pool.query(
        `SELECT 
            es.id,
            g.name AS "gradeName",
            g.id AS "gradeId",
            s.name AS "subjectName",
            es.exam_date AS "examDate",
            es.start_time AS "startTime",
            es.end_time AS "endTime",
            es.max_marks AS "maxMarks",
            es.passing_marks AS "passingMarks"
        FROM exam_schedules es
        INNER JOIN grades g ON es.grade_id = g.id
        INNER JOIN subjects s ON es.subject_id = s.id
        WHERE es.exam_id = $1
        ORDER BY es.exam_date ASC`,
        [examId]
    );

    return { ...exam, schedules };
}

// ─── Admission Lead Detail ────────────────────────────────
export async function getAdmissionLeadDetail(leadId: string) {
    if (!isValidUUID(leadId)) return null;
    const { tenantId } = await requireAuth('admissions:read');

    const { rows: leads } = await pool.query(
        `SELECT 
            id,
            child_first_name AS "childFirstName",
            child_last_name AS "childLastName",
            child_dob AS "childDob",
            applying_for_grade AS "applyingForGrade",
            parent_name AS "parentName",
            parent_email AS "parentEmail",
            parent_phone AS "parentPhone",
            source,
            stage,
            notes,
            created_at AS "createdAt"
        FROM admission_leads
        WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId]
    );

    if (leads.length === 0) return null;
    const lead = leads[0];

    // Get documents
    const { rows: applications } = await pool.query(
        `SELECT 
            id,
            application_number AS "applicationNumber",
            submitted_at AS "submittedAt",
            created_at AS "createdAt"
        FROM admission_applications
        WHERE lead_id = $1
        ORDER BY created_at DESC`,
        [leadId]
    );

    return { ...lead, applications };
}

// ─── Section Info (for attendance marking) ────────────────
export async function getSectionInfo(sectionId: string) {
    if (!isValidUUID(sectionId)) return null;
    const { tenantId } = await requireAuth();

    const { rows } = await pool.query(
        `SELECT 
            sec.id,
            sec.name AS "sectionName",
            g.name AS "gradeName"
        FROM sections sec
        INNER JOIN grades g ON sec.grade_id = g.id
        WHERE sec.id = $1 AND sec.tenant_id = $2`,
        [sectionId, tenantId]
    );

    return rows.length > 0 ? rows[0] : null;
}

// ─── Attendance for section on date ───────────────────────
export async function getAttendanceForSection(sectionId: string, date: string) {
    if (!isValidUUID(sectionId)) return [];
    const { tenantId } = await requireAuth('attendance:read');

    const { rows } = await pool.query(
        `SELECT 
            student_id AS "studentId",
            status
        FROM attendance_records
        WHERE section_id = $1 AND tenant_id = $2 AND date = $3`,
        [sectionId, tenantId, date]
    );

    return rows;
}

// ─── Academic Years (for dropdowns) ───────────────────────
export async function getAcademicYears() {
    const { tenantId } = await requireAuth();

    const { rows } = await pool.query(
        `SELECT 
            id,
            name,
            is_current AS "isCurrent"
        FROM academic_years
        WHERE tenant_id = $1
        ORDER BY start_date DESC`,
        [tenantId]
    );

    return rows;
}

// ─── Terms (for dropdowns) ────────────────────────────────
export async function getTerms() {
    const { tenantId } = await requireAuth();

    const { rows } = await pool.query(
        `SELECT 
            id,
            name,
            type,
            academic_year_id AS "academicYearId"
        FROM terms
        WHERE tenant_id = $1
        ORDER BY start_date ASC`,
        [tenantId]
    );

    return rows;
}

// ─── Subjects list (for dropdowns) ────────────────────────
export async function getSubjects() {
    const { tenantId } = await requireAuth();

    const { rows } = await pool.query(
        `SELECT 
            id,
            name,
            code
        FROM subjects
        WHERE tenant_id = $1
        ORDER BY name ASC`,
        [tenantId]
    );

    return rows;
}
