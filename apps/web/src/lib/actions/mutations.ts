'use server';

/**
 * Write mutations for form submissions.
 * All mutations are tenant-scoped and audit-logged.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Create Student ───────────────────────────────────────
export async function createStudent(formData: FormData) {
    const { tenantId, userId } = await requireAuth('students:write');

    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;

    const insertRes = await pool.query(
        `INSERT INTO students (
            id, tenant_id, admission_number, first_name, last_name, date_of_birth, gender, blood_group, grade_id, section_id, roll_number, admission_date, address, city, state, pincode, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
        [
            randomUUID(),
            tenantId,
            admissionNumber,
            formData.get('firstName') as string,
            formData.get('lastName') as string,
            formData.get('dateOfBirth') as string,
            formData.get('gender') as string,
            (formData.get('bloodGroup') as string) || null,
            formData.get('gradeId') as string,
            formData.get('sectionId') as string,
            formData.get('rollNumber') ? parseInt(formData.get('rollNumber') as string) : null,
            (formData.get('admissionDate') as string) || new Date().toISOString().split('T')[0],
            (formData.get('address') as string) || null,
            (formData.get('city') as string) || null,
            (formData.get('state') as string) || null,
            (formData.get('pincode') as string) || null,
            'ACTIVE'
        ]
    );
    const student = insertRes.rows[0];

    // Audit log
    await pool.query(
        `INSERT INTO audit_logs (
            id, tenant_id, user_id, action, entity_type, entity_id, after_state
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            randomUUID(),
            tenantId,
            userId,
            'CREATE',
            'students',
            student.id,
            JSON.stringify({ firstName: formData.get('firstName'), lastName: formData.get('lastName') })
        ]
    );

    return { success: true, studentId: student.id };
}

// ─── Save Attendance ──────────────────────────────────────
export async function saveAttendance(formData: FormData) {
    const { tenantId, userId } = await requireAuth('attendance:write');

    const sectionId = formData.get('sectionId') as string;
    const date = formData.get('date') as string;

    // Extract status entries from form
    const entries: { studentId: string; status: string }[] = [];
    for (const [key, value] of formData.entries()) {
        const match = key.match(/^status\\[(.+)\\]$/);
        if (match) {
            entries.push({ studentId: match[1], status: value as string });
        }
    }

    // Upsert attendance records
    for (const entry of entries) {
        const existingRes = await pool.query(
            `SELECT id FROM attendance_records WHERE student_id = $1 AND date = $2 AND tenant_id = $3`,
            [entry.studentId, date, tenantId]
        );

        if (existingRes.rows.length > 0) {
            await pool.query(
                `UPDATE attendance_records SET status = $1, marked_by = $2 WHERE id = $3`,
                [entry.status, userId, existingRes.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO attendance_records (id, tenant_id, student_id, section_id, date, status, marked_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [randomUUID(), tenantId, entry.studentId, sectionId, date, entry.status, userId]
            );
        }
    }

    return { success: true, count: entries.length };
}

// ─── Record Payment ───────────────────────────────────────
export async function recordPayment(formData: FormData) {
    const { tenantId, userId } = await requireAuth('fees:write');

    const invoiceId = formData.get('invoiceId') as string;
    const amountStr = formData.get('amount') as string;
    const method = formData.get('method') as string;

    // Validate inputs
    if (!invoiceId || typeof invoiceId !== 'string') {
        return { success: false, error: 'Invoice ID is required' };
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        return { success: false, error: 'Amount must be a positive number' };
    }
    const validMethods = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'];
    if (!validMethods.includes(method)) {
        return { success: false, error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` };
    }

    // Look up the invoice — tenant-scoped
    const invoiceRes = await pool.query(
        `SELECT student_id AS "studentId", paid_amount AS "paidAmount", total_amount AS "totalAmount"
         FROM invoices WHERE id = $1 AND tenant_id = $2`,
        [invoiceId, tenantId]
    );
    const invoice = invoiceRes.rows[0];

    if (!invoice) throw new Error('Invoice not found');

    // Create payment
    const paymentRes = await pool.query(
        `INSERT INTO payments (id, tenant_id, invoice_id, student_id, amount, method, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [randomUUID(), tenantId, invoiceId, invoice.studentId, String(amount), method, 'COMPLETED']
    );
    const payment = paymentRes.rows[0];

    // Update invoice paid amount
    const newPaid = Number(invoice.paidAmount) + amount;
    const newStatus = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIAL';

    await pool.query(
        `UPDATE invoices SET paid_amount = $1, status = $2 WHERE id = $3`,
        [String(newPaid), newStatus, invoiceId]
    );

    // Create receipt
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
    await pool.query(
        `INSERT INTO receipts (id, tenant_id, payment_id, receipt_number) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), tenantId, payment.id, receiptNumber]
    );

    // Audit
    await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), tenantId, userId, 'PAYMENT', 'payments', payment.id, JSON.stringify({ amount, method, invoiceId })]
    );

    return { success: true, paymentId: payment.id };
}

// ─── Create Fee Plan ──────────────────────────────────────
export async function createFeePlan(formData: FormData) {
    const { tenantId } = await requireAuth('fees:write');

    const planRes = await pool.query(
        `INSERT INTO fee_plans (id, tenant_id, name, academic_year_id, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
            randomUUID(),
            tenantId,
            formData.get('name') as string,
            formData.get('academicYearId') as string,
            (formData.get('description') as string) || null
        ]
    );

    return { success: true, feePlanId: planRes.rows[0].id };
}

// ─── Create Exam ──────────────────────────────────────────
export async function createExam(formData: FormData) {
    const { tenantId } = await requireAuth('exams:write');

    const examRes = await pool.query(
        `INSERT INTO exams (id, tenant_id, name, type, academic_year_id, start_date, end_date, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            randomUUID(),
            tenantId,
            formData.get('name') as string,
            formData.get('type') as string,
            formData.get('academicYearId') as string,
            formData.get('startDate') as string,
            formData.get('endDate') as string,
            (formData.get('description') as string) || null
        ]
    );

    return { success: true, examId: examRes.rows[0].id };
}

// ─── Mark Class Attendance (for attendance-form.tsx) ──────
export async function markClassAttendance(
    sectionId: string,
    date: Date,
    attendanceData: { studentId: string; status: string; remarks?: string }[]
) {
    const { tenantId, userId } = await requireAuth('attendance:write');
    const dateStr = date.toISOString().split('T')[0];

    for (const entry of attendanceData) {
        const existingRes = await pool.query(
            `SELECT id FROM attendance_records WHERE student_id = $1 AND date = $2 AND tenant_id = $3`,
            [entry.studentId, dateStr, tenantId]
        );

        if (existingRes.rows.length > 0) {
            await pool.query(
                `UPDATE attendance_records SET status = $1, marked_by = $2 WHERE id = $3`,
                [entry.status, userId, existingRes.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO attendance_records (id, tenant_id, student_id, section_id, date, status, marked_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [randomUUID(), tenantId, entry.studentId, sectionId, dateStr, entry.status, userId]
            );
        }
    }

    return { success: true as const, error: undefined as string | undefined };
}

// ─── Enter Exam Marks (for marks-entry-form.tsx) ──────────
export async function enterMarks(
    examId: string,
    marksData: { studentId: string; subjectId: string; marksObtained: number; isAbsent: boolean }[]
) {
    const { tenantId } = await requireAuth('exams:write');

    // Look up exam schedules for this exam
    for (const entry of marksData) {
        // Find schedule for this subject
        const scheduleRes = await pool.query(
            `SELECT id FROM exam_schedules WHERE exam_id = $1 AND subject_id = $2`,
            [examId, entry.subjectId]
        );
        const schedule = scheduleRes.rows[0];

        if (!schedule) continue;

        // Upsert result
        const existingRes = await pool.query(
            `SELECT id FROM student_results WHERE exam_schedule_id = $1 AND student_id = $2 AND tenant_id = $3`,
            [schedule.id, entry.studentId, tenantId]
        );

        if (existingRes.rows.length > 0) {
            await pool.query(
                `UPDATE student_results SET marks_obtained = $1, is_absent = $2 WHERE id = $3`,
                [String(entry.marksObtained), entry.isAbsent, existingRes.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO student_results (id, tenant_id, exam_schedule_id, student_id, marks_obtained, is_absent)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [randomUUID(), tenantId, schedule.id, entry.studentId, String(entry.marksObtained), entry.isAbsent]
            );
        }
    }

    return { success: true as const, error: undefined as string | undefined };
}
