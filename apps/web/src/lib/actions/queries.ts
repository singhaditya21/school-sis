'use server';
/**
 * Consolidated detail queries for sub-pages.
 * All queries are tenant-scoped via requireAuth() middleware.
 */

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { logAudit } from '@/lib/audit';
import { decryptFieldTolerant } from '@/lib/encryption';
import { maskDeniedFields } from '@/lib/auth/field-masking';

function isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// ─── Student Detail ───────────────────────────────────────
export async function getStudentDetail(studentId: string) {
    if (!isValidUUID(studentId)) return null;
    const { tenantId, userId, session } = await requireAuth('students:read');

    const students = await sql<{
        id: string;
        admissionNumber: string;
        firstName: string;
        lastName: string;
        dateOfBirth: string | null;
        gender: string | null;
        bloodGroup: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
        rollNumber: string | null;
        admissionDate: string | null;
        status: string;
        gradeName: string;
        sectionName: string;
    }>`
        SELECT 
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
        WHERE s.id = ${studentId} AND s.tenant_id = ${tenantId}
    `;

    if (students.length === 0) return null;
    const student = students[0];

    // DPDPA accountability: record WHO read this child's full record — it
    // includes date of birth, address, blood group and guardian contact. The
    // list views are coarse; this single-record read is the one worth naming.
    await logAudit({
        tenantId,
        userId,
        action: 'READ',
        entityType: 'student',
        entityId: student.id,
        description: `Viewed full record for student ${student.admissionNumber}`,
    });

    const guardians = await sql<{
        id: string;
        firstName: string;
        lastName: string;
        relation: string;
        phone: string | null;
        email: string | null;
        occupation: string | null;
        isPrimary: boolean;
    }>`
        SELECT 
            id,
            first_name AS "firstName",
            last_name AS "lastName",
            relation,
            COALESCE(phone_enc, phone) AS "phone",
            COALESCE(email_enc, email) AS "email",
            occupation,
            is_primary AS "isPrimary"
        FROM guardians
        WHERE student_id = ${studentId} AND tenant_id = ${tenantId}
    `;

    // Enforce the field policy: a role without registrar-grade access to student
    // PII (date of birth, blood group, address) or guardian contact sees those
    // fields nulled rather than the whole record. AUTHORIZATION_FIELD_POLICIES
    // existed but was enforced nowhere; this is the enforcement point.
    const role = session.role ?? '';
    const maskedStudent = maskDeniedFields(role, 'students', student);
    const decodedGuardians = guardians.map((guardian) => ({
        ...guardian,
        phone: guardian.phone == null ? null : decryptFieldTolerant(guardian.phone),
        email: guardian.email == null ? null : decryptFieldTolerant(guardian.email),
    }));
    const maskedGuardians = decodedGuardians.map((guardian) =>
        maskDeniedFields(role, 'guardians', guardian),
    );

    return { ...maskedStudent, guardians: maskedGuardians };
}

// ─── Students by Section (for attendance, timetable) ──────
export async function getStudentsBySection(sectionId: string) {
    if (!isValidUUID(sectionId)) return [];
    const { tenantId } = await requireAuth('students:read');

    return sql<{
        id: string;
        admissionNumber: string;
        firstName: string;
        lastName: string;
        rollNumber: string | null;
    }>`
        SELECT 
            id,
            admission_number AS "admissionNumber",
            first_name AS "firstName",
            last_name AS "lastName",
            roll_number AS "rollNumber"
        FROM students
        WHERE section_id = ${sectionId} AND tenant_id = ${tenantId} AND status = 'ACTIVE'
        ORDER BY roll_number ASC, first_name ASC
    `;
}

// ─── Invoice Detail ───────────────────────────────────────
export async function getInvoiceDetail(invoiceId: string) {
    if (!isValidUUID(invoiceId)) return null;
    const { tenantId } = await requireAuth('fees:read');

    const invoices = await sql<{
        id: string;
        invoiceNumber: string;
        totalAmount: string;
        paidAmount: string;
        dueDate: string;
        status: string;
        description: string | null;
        studentFirstName: string;
        studentLastName: string;
        studentId: string;
        feePlanId: string;
    }>`
        SELECT 
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
        WHERE i.id = ${invoiceId} AND i.tenant_id = ${tenantId}
    `;

    if (invoices.length === 0) return null;
    const invoice = invoices[0];

    // Get fee components (line items)
    const components = await sql<{
        name: string;
        amount: string;
        frequency: string;
        isOptional: boolean;
    }>`
        SELECT 
            name,
            amount,
            frequency,
            is_optional AS "isOptional"
        FROM fee_components
        WHERE fee_plan_id = ${invoice.feePlanId}
        ORDER BY created_at ASC
    `;

    // Payments, with the receipt each one issued so the UI can link to it.
    const payments = await sql<{
        id: string;
        amount: string;
        method: string;
        status: string;
        reference: string | null;
        chequeNumber: string | null;
        bankName: string | null;
        createdAt: Date;
        receiptId: string | null;
        receiptNumber: string | null;
    }>`
        SELECT
            p.id,
            p.amount,
            p.method,
            p.status,
            p.transaction_id AS "reference",
            p.cheque_number AS "chequeNumber",
            p.bank_name AS "bankName",
            p.created_at AS "createdAt",
            r.id AS "receiptId",
            r.receipt_number AS "receiptNumber"
        FROM payments p
        LEFT JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
        WHERE p.invoice_id = ${invoiceId} AND p.tenant_id = ${tenantId}
        ORDER BY p.created_at DESC
    `;

    return {
        ...invoice,
        studentName: `${invoice.studentFirstName} ${invoice.studentLastName}`,
        dueAmount: String(Number(invoice.totalAmount) - Number(invoice.paidAmount)),
        lineItems: components,
        payments,
    };
}

// ─── Section Info (for attendance marking) ────────────────
export async function getSectionInfo(sectionId: string) {
    if (!isValidUUID(sectionId)) return null;
    const { tenantId } = await requireAuth();

    const rows = await sql<{
        id: string;
        sectionName: string;
        gradeName: string;
    }>`
        SELECT 
            sec.id,
            sec.name AS "sectionName",
            g.name AS "gradeName"
        FROM sections sec
        INNER JOIN grades g ON sec.grade_id = g.id
        WHERE sec.id = ${sectionId} AND sec.tenant_id = ${tenantId}
    `;

    return rows.length > 0 ? rows[0] : null;
}

// ─── Attendance for section on date ───────────────────────
export async function getAttendanceForSection(sectionId: string, date: string) {
    if (!isValidUUID(sectionId)) return [];
    const { tenantId } = await requireAuth('attendance:read');

    return sql<{
        studentId: string;
        status: string;
    }>`
        SELECT 
            student_id AS "studentId",
            status
        FROM attendance_records
        WHERE section_id = ${sectionId} AND tenant_id = ${tenantId} AND date = ${date}
    `;
}

// ─── Academic Years (for dropdowns) ───────────────────────
export async function getAcademicYears() {
    const { tenantId } = await requireAuth();

    return sql<{
        id: string;
        name: string;
        isCurrent: boolean;
    }>`
        SELECT 
            id,
            name,
            is_current AS "isCurrent"
        FROM academic_years
        WHERE tenant_id = ${tenantId}
        ORDER BY start_date DESC
    `;
}
