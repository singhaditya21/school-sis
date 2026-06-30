'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface ParentFeeParams {
    limit?: number;
    offset?: number;
    status?: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
}

export interface ParentResultParams {
    examId?: string;
}

export interface ParentAttendanceParams {
    month: number;
    year: number;
}

export interface ParentFeeResponse {
    invoices: {
        id: string;
        invoiceNo: string;
        description: string;
        amount: number;
        paidAmount: number;
        dueDate: string;
        status: string;
        studentName: string;
    }[];
    payments: {
        id: string;
        amount: number;
        method: string;
        paidAt: string;
        receiptNo: string;
        status: string;
        studentName: string;
        invoiceNo: string;
    }[];
}

export async function getMyFees(params?: ParentFeeParams): Promise<ParentFeeResponse> {
    const { tenantId, userId } = await requireAuth('parent:read');
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    
    let statusFilter = '';
    const queryParams: any[] = [tenantId, userId, limit, offset];
    
    if (params?.status) {
        queryParams.push(params.status);
        statusFilter = `AND i.status = $5`;
    }

    const { rows: invoices } = await pool.query(`
        SELECT i.id, i.invoice_number AS "invoiceNo", i.description, i.total_amount AS amount,
               i.paid_amount AS "paidAmount", i.due_date AS "dueDate", i.status,
               s.first_name || ' ' || s.last_name AS "studentName"
        FROM invoices i 
        JOIN students s ON s.id = i.student_id
        JOIN guardians g ON g.student_id = s.id
        WHERE i.tenant_id = $1 AND g.user_id = $2
        ${statusFilter}
        ORDER BY i.due_date DESC 
        LIMIT $3 OFFSET $4
    `, queryParams);

    const { rows: payments } = await pool.query(`
        SELECT p.id, p.amount, p.method, p.paid_at AS "paidAt", r.receipt_number AS "receiptNo", p.status,
               s.first_name || ' ' || s.last_name AS "studentName", i.invoice_number AS "invoiceNo"
        FROM payments p 
        JOIN invoices i ON i.id = p.invoice_id
        JOIN students s ON s.id = i.student_id
        JOIN guardians g ON g.student_id = s.id
        LEFT JOIN receipts r ON r.payment_id = p.id
        WHERE p.tenant_id = $1 AND g.user_id = $2
        ORDER BY p.paid_at DESC 
        LIMIT $3 OFFSET $4
    `, [tenantId, userId, limit, offset]);

    return { 
        invoices: invoices.map(i => ({
            ...i,
            amount: Number(i.amount),
            paidAmount: Number(i.paidAmount),
            dueDate: i.dueDate instanceof Date ? i.dueDate.toISOString().split('T')[0] : String(i.dueDate)
        })),
        payments: payments.map(p => ({
            ...p,
            amount: Number(p.amount),
            paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString().split('T')[0] : String(p.paidAt)
        }))
    };
}

export interface MyResult {
    examId: string;
    examName: string;
    subject: string;
    marksObtained: number;
    totalMarks: number;
    percentage: number;
    grade: string;
    remarks: string | null;
    studentName: string;
}

export async function getMyResults(params?: ParentResultParams): Promise<MyResult[]> {
    const { tenantId, userId } = await requireAuth('parent:read');
    let examFilter = '';
    const queryParams: any[] = [tenantId, userId];

    if (params?.examId) {
        queryParams.push(params.examId);
        examFilter = `AND e.id = $3`;
    }

    const { rows } = await pool.query(`
        SELECT 
            e.id AS "examId",
            e.name AS "examName", 
            sub.name AS subject,
            sr.marks_obtained AS "marksObtained", 
            es.max_marks AS "totalMarks",
            ROUND(sr.marks_obtained::numeric / NULLIF(es.max_marks::numeric, 0) * 100, 1) AS percentage,
            sr.grade, 
            sr.remarks,
            s.first_name || ' ' || s.last_name AS "studentName"
        FROM student_results sr
        JOIN exam_schedules es ON es.id = sr.exam_schedule_id
        JOIN subjects sub ON sub.id = es.subject_id
        JOIN exams e ON e.id = es.exam_id
        JOIN students s ON s.id = sr.student_id
        JOIN guardians g ON g.student_id = s.id
        WHERE e.tenant_id = $1 AND g.user_id = $2
        ${examFilter}
        ORDER BY e.start_date DESC, s.first_name, sub.name
    `, queryParams);

    return rows.map((r: any) => ({
        ...r,
        marksObtained: Number(r.marksObtained),
        totalMarks: Number(r.totalMarks),
        percentage: Number(r.percentage)
    }));
}

export interface MyAttendanceRecord {
    date: string;
    status: string;
    studentName: string;
}

export async function getMyAttendance(params: ParentAttendanceParams): Promise<MyAttendanceRecord[]> {
    const { tenantId, userId } = await requireAuth('parent:read');

    const { rows } = await pool.query(`
        SELECT ar.date, ar.status, s.first_name || ' ' || s.last_name AS "studentName"
        FROM attendance_records ar 
        JOIN students s ON s.id = ar.student_id
        JOIN guardians g ON g.student_id = s.id
        WHERE ar.tenant_id = $1 AND g.user_id = $2
          AND EXTRACT(MONTH FROM ar.date) = $3 AND EXTRACT(YEAR FROM ar.date) = $4
        ORDER BY s.first_name, ar.date
    `, [tenantId, userId, params.month, params.year]);

    return rows.map((r: any) => ({
        ...r,
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
    }));
}

export interface ParentOverviewData {
    students: { name: string; class: string; }[];
    pendingFees: { totalAmount: number; nearestDueDate: string | null; };
    attendanceRate: number;
}

export async function getParentOverview(): Promise<ParentOverviewData> {
    const { tenantId, userId } = await requireAuth('parent:read');

    const { rows: students } = await pool.query(`
        SELECT s.first_name || ' ' || s.last_name AS name,
               g.name || ' - ' || sec.name AS class
        FROM students s
        JOIN guardians gd ON gd.student_id = s.id
        JOIN grades g ON g.id = s.grade_id
        JOIN sections sec ON sec.id = s.section_id
        WHERE s.tenant_id = $1 AND gd.user_id = $2
        ORDER BY s.first_name
    `, [tenantId, userId]);

    const { rows: feeRows } = await pool.query(`
        SELECT COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS "totalAmount",
               MIN(i.due_date) AS "nearestDueDate"
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        JOIN guardians gd ON gd.student_id = s.id
        WHERE i.tenant_id = $1 AND gd.user_id = $2 AND i.status != 'PAID'
    `, [tenantId, userId]);

    const now = new Date();
    const { rows: attRows } = await pool.query(`
        SELECT 
            COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE')) AS present,
            COUNT(*) FILTER (WHERE ar.status != 'HOLIDAY') AS total
        FROM attendance_records ar
        JOIN students s ON s.id = ar.student_id
        JOIN guardians gd ON gd.student_id = s.id
        WHERE ar.tenant_id = $1 AND gd.user_id = $2
          AND EXTRACT(MONTH FROM ar.date) = $3
          AND EXTRACT(YEAR FROM ar.date) = $4
    `, [tenantId, userId, now.getMonth() + 1, now.getFullYear()]);

    const present = Number(attRows[0]?.present || 0);
    const total = Number(attRows[0]?.total || 0);

    return {
        students,
        pendingFees: {
            totalAmount: Number(feeRows[0]?.totalAmount || 0),
            nearestDueDate: feeRows[0]?.nearestDueDate
                ? (feeRows[0].nearestDueDate instanceof Date
                    ? feeRows[0].nearestDueDate.toISOString().split('T')[0]
                    : String(feeRows[0].nearestDueDate))
                : null
        },
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0
    };
}

export interface ParentAlert {
    id: string;
    channel: string;
    subject: string;
    body: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
}

export async function getParentAlerts(): Promise<ParentAlert[]> {
    const { tenantId, userId } = await requireAuth('parent:read');

    const { rows } = await pool.query(`
        SELECT id, channel, subject, body, status,
               sent_at AS "sentAt", created_at AS "createdAt"
        FROM messages
        WHERE tenant_id = $1 AND recipient_id = $2
        ORDER BY created_at DESC
        LIMIT 50
    `, [tenantId, userId]);

    return rows.map((r: any) => ({
        ...r,
        sentAt: r.sentAt ? (r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt)) : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
    }));
}

export interface ConsentFormForParent {
    id: string;
    title: string;
    description: string | null;
    formType: string;
    dueDate: string | null;
    isActive: boolean;
    studentName: string;
    response: string | null;
    respondedAt: string | null;
}

export async function getParentConsentData(): Promise<ConsentFormForParent[]> {
    const { tenantId, userId } = await requireAuth('parent:read');

    const { rows } = await pool.query(`
        SELECT cf.id, cf.title, cf.description, cf.form_type AS "formType",
               cf.due_date AS "dueDate", cf.is_active AS "isActive",
               s.first_name || ' ' || s.last_name AS "studentName",
               cr.response, cr.responded_at AS "respondedAt"
        FROM consent_forms cf
        CROSS JOIN (
            SELECT DISTINCT s2.id, s2.first_name, s2.last_name
            FROM students s2
            JOIN guardians gd ON gd.student_id = s2.id
            WHERE s2.tenant_id = $1 AND gd.user_id = $2
        ) s
        LEFT JOIN consent_responses cr ON cr.form_id = cf.id AND cr.student_id = s.id AND cr.tenant_id = $1
        WHERE cf.tenant_id = $1
          AND (cf.audience = 'ALL' OR cf.audience = 'PARENTS')
        ORDER BY cf.created_at DESC
    `, [tenantId, userId]);

    return rows.map((r: any) => ({
        ...r,
        dueDate: r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) : null,
        respondedAt: r.respondedAt ? (r.respondedAt instanceof Date ? r.respondedAt.toISOString() : String(r.respondedAt)) : null
    }));
}
