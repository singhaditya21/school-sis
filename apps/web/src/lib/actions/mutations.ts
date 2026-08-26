'use server';

/**
 * Write mutations for form submissions.
 * All mutations are tenant-scoped and audit-logged.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { recordManualPayment } from '@/lib/payments/ledger';
import { revalidatePath } from 'next/cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
    if (!value || !UUID_RE.test(value)) {
        throw new Error(`Invalid ${label}`);
    }
}

async function assertGradeAndSectionBelongToTenant(tenantId: string, gradeId: string, sectionId: string) {
    assertUuid(gradeId, 'grade');
    assertUuid(sectionId, 'section');

    const { rowCount } = await pool.query(
        `SELECT 1
         FROM sections sec
         JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sec.tenant_id
         WHERE sec.id = $1
           AND sec.tenant_id = $2
           AND g.id = $3
         LIMIT 1`,
        [sectionId, tenantId, gradeId],
    );

    if (rowCount === 0) {
        throw new Error('Grade or section not found for tenant');
    }
}

async function assertSectionBelongsToTenant(tenantId: string, sectionId: string) {
    assertUuid(sectionId, 'section');

    const { rowCount } = await pool.query(
        `SELECT 1 FROM sections WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [sectionId, tenantId],
    );

    if (rowCount === 0) {
        throw new Error('Section not found for tenant');
    }
}

async function assertStudentsBelongToSection(tenantId: string, sectionId: string, studentIds: string[]) {
    const uniqueStudentIds = Array.from(new Set(studentIds));
    uniqueStudentIds.forEach((studentId) => assertUuid(studentId, 'student'));
    if (uniqueStudentIds.length === 0) return;

    const { rows } = await pool.query(
        `SELECT id
         FROM students
         WHERE tenant_id = $1
           AND section_id = $2
           AND id = ANY($3::uuid[])`,
        [tenantId, sectionId, uniqueStudentIds],
    );

    if (rows.length !== uniqueStudentIds.length) {
        throw new Error('One or more students do not belong to this tenant section');
    }
}

async function assertStudentsBelongToTenant(tenantId: string, studentIds: string[]) {
    const uniqueStudentIds = Array.from(new Set(studentIds));
    uniqueStudentIds.forEach((studentId) => assertUuid(studentId, 'student'));
    if (uniqueStudentIds.length === 0) return;

    const { rows } = await pool.query(
        `SELECT id
         FROM students
         WHERE tenant_id = $1
           AND id = ANY($2::uuid[])`,
        [tenantId, uniqueStudentIds],
    );

    if (rows.length !== uniqueStudentIds.length) {
        throw new Error('One or more students do not belong to this tenant');
    }
}

async function assertAcademicYearBelongsToTenant(tenantId: string, academicYearId: string) {
    assertUuid(academicYearId, 'academic year');

    const { rowCount } = await pool.query(
        `SELECT 1 FROM academic_years WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [academicYearId, tenantId],
    );

    if (rowCount === 0) {
        throw new Error('Academic year not found for tenant');
    }
}

async function assertExamBelongsToTenant(tenantId: string, examId: string) {
    assertUuid(examId, 'exam');

    const { rowCount } = await pool.query(
        `SELECT 1 FROM exams WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [examId, tenantId],
    );

    if (rowCount === 0) {
        throw new Error('Exam not found for tenant');
    }
}

// ─── Create Student ───────────────────────────────────────
export async function createStudent(formData: FormData) {
    const { tenantId, userId } = await requireAuth('students:write');

    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;
    const gradeId = formData.get('gradeId') as string;
    const sectionId = formData.get('sectionId') as string;
    await assertGradeAndSectionBelongToTenant(tenantId, gradeId, sectionId);

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
            gradeId,
            sectionId,
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
    await assertSectionBelongsToTenant(tenantId, sectionId);

    // Extract status entries from form
    const entries: { studentId: string; status: string }[] = [];
    for (const [key, value] of formData.entries()) {
        const match = key.match(/^status\[(.+)\]$/);
        if (match) {
            entries.push({ studentId: match[1], status: value as string });
        }
    }
    // Reporting success on an empty submission is how this silently lost a full
    // day of attendance for as long as the field-name regex was wrong.
    if (entries.length === 0) {
        return { success: false, error: 'No attendance entries were submitted.' };
    }

    await assertStudentsBelongToSection(tenantId, sectionId, entries.map((entry) => entry.studentId));

    // Upsert attendance records
    for (const entry of entries) {
        const existingRes = await pool.query(
            `SELECT id FROM attendance_records WHERE student_id = $1 AND date = $2 AND tenant_id = $3`,
            [entry.studentId, date, tenantId]
        );

        if (existingRes.rows.length > 0) {
            await pool.query(
                `UPDATE attendance_records SET status = $1, marked_by = $2 WHERE id = $3 AND tenant_id = $4`,
                [entry.status, userId, existingRes.rows[0].id, tenantId]
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

/**
 * Flat rather than a discriminated union: Next.js erases the narrowing across the
 * 'use server' boundary, so callers cannot discriminate on `success`. Matches the
 * shape already used in lib/actions/users.ts.
 */
export type RecordPaymentResult = {
    success: boolean;
    paymentId?: string;
    receiptId?: string;
    receiptNumber?: string;
    error?: string;
};

/** Amounts are numeric(12,2); reject anything Postgres would silently round. */
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;
const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'];
const MAX_REFERENCE_LENGTH = 255;

function readOptionalText(formData: FormData, field: string): string | undefined {
    const raw = formData.get(field);
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Record a payment taken at the counter (cash, cheque, UPI, card or bank transfer).
 *
 * The write itself is transactional inside recordManualPayment, which locks the
 * invoice, rejects over-payment, updates the balance and issues a receipt. This
 * wrapper only validates input and converts thrown errors into a typed failure so
 * the form can show them instead of surfacing a raw Server Action crash.
 */
export async function recordPayment(formData: FormData): Promise<RecordPaymentResult> {
    const { tenantId, userId } = await requireAuth('fees:write');

    const invoiceId = formData.get('invoiceId');
    const amountStr = formData.get('amount');
    const method = formData.get('method');

    if (typeof invoiceId !== 'string' || !UUID_RE.test(invoiceId)) {
        return { success: false, error: 'Select a valid invoice.' };
    }
    if (typeof amountStr !== 'string' || !AMOUNT_RE.test(amountStr.trim())) {
        return { success: false, error: 'Enter an amount in rupees, with at most two decimal places.' };
    }
    const amount = Number(amountStr.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, error: 'Amount must be greater than zero.' };
    }
    if (typeof method !== 'string' || !PAYMENT_METHODS.includes(method)) {
        return { success: false, error: `Choose a payment method: ${PAYMENT_METHODS.join(', ')}.` };
    }

    const reference = readOptionalText(formData, 'reference');
    const chequeNumber = readOptionalText(formData, 'chequeNumber');
    const bankName = readOptionalText(formData, 'bankName');
    for (const [label, value] of [['Reference', reference], ['Cheque number', chequeNumber], ['Bank name', bankName]] as const) {
        if (value && value.length > MAX_REFERENCE_LENGTH) {
            return { success: false, error: `${label} must be ${MAX_REFERENCE_LENGTH} characters or fewer.` };
        }
    }

    let payment: { paymentId: string; receiptId: string; receiptNumber: string };
    try {
        payment = await recordManualPayment({
            tenantId,
            invoiceId,
            amount,
            method,
            actorUserId: userId,
            reference,
            chequeNumber,
            bankName,
            metadata: { source: 'staff_form' },
        });
    } catch (error) {
        // recordManualPayment throws on a missing invoice and on over-payment.
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not record the payment.',
        };
    }

    // The money is already committed. An audit-trail failure must not fail the
    // request — payment_audit_logs holds the authoritative in-transaction record.
    try {
        await pool.query(
            `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, after_state)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [randomUUID(), tenantId, userId, 'PAYMENT', 'payments', payment.paymentId, JSON.stringify({ amount, method, invoiceId })],
        );
    } catch {
        // Intentionally swallowed; see comment above.
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);

    return {
        success: true,
        paymentId: payment.paymentId,
        receiptId: payment.receiptId,
        receiptNumber: payment.receiptNumber,
    };
}

// ─── Create Fee Plan ──────────────────────────────────────
/**
 * Creates a fee plan together with its fee components in ONE transaction.
 *
 * A plan without components cannot be invoiced at all (`generateInvoices`
 * rejects it), and a plan whose components are all optional would price every
 * invoice at zero, because invoicing sums MANDATORY components only. Both are
 * refused here rather than persisted as a silently unusable plan.
 *
 * The component rows arrive as parallel repeated form fields:
 *   componentName / componentAmount / componentFrequency / componentIsOptional
 * `componentIsOptional` is a hidden 'true'/'false' field rather than a
 * checkbox so unchecked rows still submit and the arrays stay aligned.
 */
export async function createFeePlan(
    formData: FormData,
): Promise<{ success: boolean; error?: string; feePlanId?: string }> {
    const { tenantId } = await requireAuth('fees:write');

    // Mirrors the fee_frequency enum in the database.
    const FEE_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'TERM_WISE', 'ANNUAL', 'ONE_TIME'];
    // numeric(12,2), positive rupees: up to 10 integer digits and 2 decimals.
    const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { success: false, error: 'Plan name is required.' };
    if (name.length > 255) return { success: false, error: 'Plan name must be 255 characters or fewer.' };

    const academicYearId = String(formData.get('academicYearId') ?? '').trim();
    if (!academicYearId) return { success: false, error: 'Select an academic year.' };
    try {
        await assertAcademicYearBelongsToTenant(tenantId, academicYearId);
    } catch {
        return { success: false, error: 'Select a valid academic year.' };
    }

    const description = String(formData.get('description') ?? '').trim();

    const names = formData.getAll('componentName').map((value) => String(value).trim());
    const amounts = formData.getAll('componentAmount').map((value) => String(value).trim());
    const frequencies = formData.getAll('componentFrequency').map((value) => String(value).trim().toUpperCase());
    const optionalFlags = formData.getAll('componentIsOptional').map((value) => String(value).trim());

    if (
        names.length !== amounts.length ||
        names.length !== frequencies.length ||
        names.length !== optionalFlags.length
    ) {
        return { success: false, error: 'Fee component rows were incomplete. Please re-enter them.' };
    }
    if (names.length === 0) {
        return { success: false, error: 'Add at least one fee component — a plan with none cannot be invoiced.' };
    }
    if (names.length > 50) {
        return { success: false, error: 'A fee plan can hold at most 50 components.' };
    }

    const components: { name: string; amount: string; frequency: string; isOptional: boolean }[] = [];
    for (let index = 0; index < names.length; index++) {
        const componentName = names[index];
        const position = index + 1;

        if (!componentName) return { success: false, error: `Component ${position}: name is required.` };
        if (componentName.length > 255) {
            return { success: false, error: `Component ${position}: name must be 255 characters or fewer.` };
        }

        const rawAmount = amounts[index];
        if (!AMOUNT_PATTERN.test(rawAmount)) {
            return {
                success: false,
                error: `Component "${componentName}": enter an amount in rupees, e.g. 15000 or 15000.50.`,
            };
        }
        const amountValue = Number(rawAmount);
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
            return { success: false, error: `Component "${componentName}": amount must be greater than zero.` };
        }

        const frequency = frequencies[index];
        if (!FEE_FREQUENCIES.includes(frequency)) {
            return { success: false, error: `Component "${componentName}": choose a valid frequency.` };
        }

        components.push({
            name: componentName,
            amount: amountValue.toFixed(2),
            frequency,
            isOptional: optionalFlags[index] === 'true',
        });
    }

    if (!components.some((component) => !component.isOptional)) {
        return {
            success: false,
            error: 'At least one component must be mandatory — invoices are priced from mandatory components only.',
        };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const planRes = await client.query(
            `INSERT INTO fee_plans (id, tenant_id, name, academic_year_id, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [randomUUID(), tenantId, name, academicYearId, description || null],
        );
        const feePlanId: string = planRes.rows[0].id;

        for (const component of components) {
            await client.query(
                `INSERT INTO fee_components (id, fee_plan_id, name, amount, frequency, is_optional)
                 VALUES ($1, $2, $3, $4, $5::fee_frequency, $6)`,
                [randomUUID(), feePlanId, component.name, component.amount, component.frequency, component.isOptional],
            );
        }

        await client.query('COMMIT');

        revalidatePath('/fees');
        revalidatePath('/fees/plans');

        return { success: true, feePlanId };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not create the fee plan.',
        };
    } finally {
        client.release();
    }
}

// ─── Create Exam ──────────────────────────────────────────
export async function createExam(formData: FormData) {
    const { tenantId } = await requireAuth('exams:write');
    const academicYearId = formData.get('academicYearId') as string;
    await assertAcademicYearBelongsToTenant(tenantId, academicYearId);

    const examRes = await pool.query(
        `INSERT INTO exams (id, tenant_id, name, type, academic_year_id, start_date, end_date, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            randomUUID(),
            tenantId,
            formData.get('name') as string,
            formData.get('type') as string,
            academicYearId,
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
    await assertSectionBelongsToTenant(tenantId, sectionId);
    await assertStudentsBelongToSection(tenantId, sectionId, attendanceData.map((entry) => entry.studentId));

    for (const entry of attendanceData) {
        const existingRes = await pool.query(
            `SELECT id FROM attendance_records WHERE student_id = $1 AND date = $2 AND tenant_id = $3`,
            [entry.studentId, dateStr, tenantId]
        );

        if (existingRes.rows.length > 0) {
            await pool.query(
                `UPDATE attendance_records SET status = $1, marked_by = $2 WHERE id = $3 AND tenant_id = $4`,
                [entry.status, userId, existingRes.rows[0].id, tenantId]
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
    await assertExamBelongsToTenant(tenantId, examId);
    await assertStudentsBelongToTenant(tenantId, marksData.map((entry) => entry.studentId));

    // Look up exam schedules for this exam
    for (const entry of marksData) {
        assertUuid(entry.subjectId, 'subject');

        // Find schedule for this subject
        const scheduleRes = await pool.query(
            `SELECT es.id
             FROM exam_schedules es
             INNER JOIN exams e ON e.id = es.exam_id
             WHERE es.exam_id = $1
               AND es.subject_id = $2
               AND e.tenant_id = $3`,
            [examId, entry.subjectId, tenantId]
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
                `UPDATE student_results SET marks_obtained = $1, is_absent = $2 WHERE id = $3 AND tenant_id = $4`,
                [String(entry.marksObtained), entry.isAbsent, existingRes.rows[0].id, tenantId]
            );
        } else {
            await pool.query(
                `INSERT INTO student_results (id, tenant_id, exam_schedule_id, student_id, marks_obtained, is_absent)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [randomUUID(), tenantId, schedule.id, entry.studentId, String(entry.marksObtained), entry.isAbsent]
            );
        }
    }

    await pool.query(
        `UPDATE exams
         SET status = 'RESULT_REVIEW',
             updated_at = NOW()
         WHERE id = $1
           AND tenant_id = $2
           AND status IN ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULT_REVIEW')`,
        [examId, tenantId],
    );

    return { success: true as const, error: undefined as string | undefined };
}
