'use server';

import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

async function tid() { const s = await getSession(); return s.tenantId; }

export async function getTenantId(): Promise<string> { return tid(); }

// --- Hostel Fees ---
export async function getHostelFees(status?: string, feeType?: string) {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT hf.id, s.admission_number AS "studentId", s.first_name||' '||s.last_name AS "studentName",
               g.name||'-'||sec.name AS class, h.name AS "hostelName", hr.room_number AS "roomNumber",
               hf.fee_type AS "feeType", hf.amount, hf.due_date AS "dueDate", hf.status, hf.paid_date AS "paidDate"
        FROM hostel_fees hf
        JOIN students s ON s.id = hf.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        LEFT JOIN hostel_allocations ha ON ha.student_id = s.id AND ha.is_active = true
        LEFT JOIN hostels h ON h.id = ha.hostel_id
        LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
        WHERE hf.tenant_id = ${tenantId}
        ${status ? sql`AND hf.status = ${status}` : sql``}
        ${feeType ? sql`AND hf.fee_type = ${feeType}` : sql``}
        ORDER BY hf.due_date DESC LIMIT 100
    `);
    return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount || 0) }));
}

// --- Library Students ---
export async function getLibraryStudents() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT s.id, s.admission_number AS "admissionNo", s.first_name||' '||s.last_name AS name,
               g.name||'-'||sec.name AS class
        FROM students s LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE s.tenant_id = ${tenantId} AND s.status = 'ACTIVE' ORDER BY s.first_name LIMIT 100
    `);
    return rows;
}

// --- Timetable Substitution ---
export async function getSubstitutionTeachers() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT u.id, u.first_name||' '||u.last_name AS name, u.department AS subject, u.is_active AS available
        FROM users u WHERE u.tenant_id = ${tenantId} AND u.role = 'TEACHER' ORDER BY u.first_name
    `);
    return rows;
}

export async function getSubstitutionRequests() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT sr.id, u.first_name||' '||u.last_name AS "originalTeacher", sr.reason,
               g.name||'-'||sec.name AS class, sr.period, sr.date,
               sub_u.first_name||' '||sub_u.last_name AS substitute, sr.status
        FROM substitution_requests sr
        JOIN users u ON u.id = sr.teacher_id
        LEFT JOIN users sub_u ON sub_u.id = sr.substitute_id
        LEFT JOIN sections sec ON sec.id = sr.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE sr.tenant_id = ${tenantId} ORDER BY sr.date DESC LIMIT 50
    `);
    return rows;
}

// --- Diary ---
export async function getDiaryEntries() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT d.id, d.title, d.content, d.date, g.name AS class, sec.name AS section,
               sub.name AS subject, u.first_name||' '||u.last_name AS "teacherName", d.type
        FROM diary_entries d
        LEFT JOIN grades g ON g.id = d.grade_id LEFT JOIN sections sec ON sec.id = d.section_id
        LEFT JOIN subjects sub ON sub.id = d.subject_id LEFT JOIN users u ON u.id = d.teacher_id
        WHERE d.tenant_id = ${tenantId} ORDER BY d.date DESC LIMIT 50
    `);
    return rows;
}

// --- Appointments ---
export async function getAppointments() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
               u.first_name||' '||u.last_name AS "with", a.status, a.type
        FROM appointments a LEFT JOIN users u ON u.id = a.with_user_id
        WHERE a.tenant_id = ${tenantId} ORDER BY a.date DESC, a.time DESC LIMIT 50
    `);
    return rows;
}

// --- Message Templates ---
export async function getMessageTemplates() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT id, name, subject, body, type, variables, created_at AS "createdAt"
        FROM message_templates WHERE tenant_id = ${tenantId} ORDER BY name
    `);
    return rows;
}

// --- Gradebook ---
export async function getGradebookData(classId?: string) {
    const tenantId = await tid();
    await setTenantContext(tenantId);

    const classes = await db.execute(sql`SELECT id, name FROM grades WHERE tenant_id = ${tenantId} ORDER BY display_order`);
    const exams = await db.execute(sql`SELECT id, name, term FROM exams WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 10`);

    let students: any[] = [];
    if (classId) {
        students = await db.execute(sql`
            SELECT s.id, s.first_name||' '||s.last_name AS name, s.roll_number AS "rollNo",
                   g.name AS class, sec.name AS section
            FROM students s LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE s.tenant_id = ${tenantId} AND g.id = ${classId} AND s.status = 'ACTIVE'
            ORDER BY s.roll_number
        `) as any[];
    }

    return { classes, exams, students };
}

// --- Parent Portal ---
export async function getMyFees() {
    const tenantId = await tid();
    const session = await getSession();
    await setTenantContext(tenantId);

    const invoices = await db.execute(sql`
        SELECT i.id, i.invoice_number AS "invoiceNo", i.description, i.total_amount AS amount,
               i.paid_amount AS "paidAmount", i.due_date AS "dueDate", i.status
        FROM invoices i JOIN students s ON s.id = i.student_id
        WHERE i.tenant_id = ${tenantId} AND s.guardian_user_id = ${session.userId}
        ORDER BY i.due_date DESC LIMIT 20
    `);

    const payments = await db.execute(sql`
        SELECT p.id, p.amount, p.method, p.paid_at AS "paidAt", p.receipt_number AS "receiptNo", p.status
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
        JOIN students s ON s.id = i.student_id
        WHERE p.tenant_id = ${tenantId} AND s.guardian_user_id = ${session.userId}
        ORDER BY p.paid_at DESC LIMIT 20
    `);

    return { invoices, payments };
}

export async function getMyResults() {
    const tenantId = await tid();
    const session = await getSession();
    await setTenantContext(tenantId);

    const rows = await db.execute(sql`
        SELECT e.name AS "examName", sub.name AS subject,
               er.marks_obtained AS "marksObtained", er.total_marks AS "totalMarks",
               ROUND(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100, 1) AS percentage,
               er.grade, er.remarks
        FROM exam_results er
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN subjects sub ON sub.id = es.subject_id
        JOIN exams e ON e.id = es.exam_id
        JOIN students s ON s.id = er.student_id
        WHERE e.tenant_id = ${tenantId} AND s.guardian_user_id = ${session.userId}
        ORDER BY e.created_at DESC, sub.name
    `);
    return rows;
}

export async function getMyAttendance(month: number, year: number) {
    const tenantId = await tid();
    const session = await getSession();
    await setTenantContext(tenantId);

    const rows = await db.execute(sql`
        SELECT ar.date, ar.status
        FROM attendance_records ar JOIN students s ON s.id = ar.student_id
        WHERE ar.tenant_id = ${tenantId} AND s.guardian_user_id = ${session.userId}
          AND EXTRACT(MONTH FROM ar.date) = ${month} AND EXTRACT(YEAR FROM ar.date) = ${year}
        ORDER BY ar.date
    `);
    return rows;
}
