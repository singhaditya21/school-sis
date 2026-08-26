'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Parent-portal server actions.
 *
 * Every query in this file is scoped to ONE child at a time and re-proves, in
 * SQL, that the requested student is linked to the signed-in user through the
 * `guardians` table. The child id never comes from the caller unchecked: it is
 * matched against the parent's own children first (`resolveChild`) and then
 * re-asserted inside each statement (`AND EXISTS (... guardians ...)`).
 * Getting this wrong shows one family another family's child, so it is checked
 * twice on purpose.
 */

export interface ParentChild {
    id: string;
    name: string;
    gradeName: string;
    sectionName: string;
    admissionNumber: string;
    rollNumber: number | null;
    status: string;
    relation: string;
}

interface ChildScope {
    tenantId: string;
    userId: string;
    child: ParentChild;
}

/** Every child linked to the signed-in guardian, alphabetically. */
export async function getMyChildren(): Promise<ParentChild[]> {
    const { tenantId, userId } = await requireAuth('parent:read:own');

    const { rows } = await pool.query(
        `SELECT s.id,
                s.first_name || ' ' || s.last_name AS name,
                g.name   AS "gradeName",
                sec.name AS "sectionName",
                s.admission_number AS "admissionNumber",
                s.roll_number      AS "rollNumber",
                s.status::text     AS status,
                MIN(gd.relation::text) AS relation
         FROM students s
         JOIN guardians gd ON gd.student_id = s.id AND gd.tenant_id = s.tenant_id
         JOIN grades g     ON g.id  = s.grade_id   AND g.tenant_id = s.tenant_id
         JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND gd.user_id = $2
         GROUP BY s.id, s.first_name, s.last_name, g.name, sec.name,
                  s.admission_number, s.roll_number, s.status
         ORDER BY s.first_name, s.last_name`,
        [tenantId, userId],
    );

    return rows.map((r: ParentChild & { rollNumber: number | string | null }) => ({
        id: r.id,
        name: r.name,
        gradeName: r.gradeName,
        sectionName: r.sectionName,
        admissionNumber: r.admissionNumber,
        rollNumber: r.rollNumber === null ? null : Number(r.rollNumber),
        status: r.status,
        relation: r.relation,
    }));
}

/**
 * Resolve the child a request is about. A studentId that is not one of this
 * guardian's children is ignored (falls back to the first child) rather than
 * honoured — an unknown id must never widen access.
 */
async function resolveChild(studentId?: string | null): Promise<ChildScope | null> {
    const { tenantId, userId } = await requireAuth('parent:read:own');
    const children = await getMyChildren();
    if (children.length === 0) return null;

    const match = studentId ? children.find((c) => c.id === studentId) : undefined;
    return { tenantId, userId, child: match ?? children[0] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guardian re-assertion appended to every child-scoped statement. */
const GUARDIAN_GUARD = `EXISTS (
    SELECT 1 FROM guardians gd
    WHERE gd.student_id = $2 AND gd.user_id = $3 AND gd.tenant_id = $1
)`;

// ─── Overview ────────────────────────────────────────────────

export interface ParentOverview {
    child: ParentChild;
    attendance: { present: number; absent: number; late: number; marked: number; rate: number | null };
    fees: { outstanding: number; nearestDueDate: string | null; overdueCount: number };
    latestExam: { examName: string; average: number; subjectCount: number } | null;
    unreadAlerts: number;
    pendingConsents: number;
    transportRoute: string | null;
}

export async function getChildOverview(studentId?: string | null): Promise<ParentOverview | null> {
    const scope = await resolveChild(studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;
    const args = [tenantId, child.id, userId];

    const now = new Date();
    const { rows: attRows } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE ar.status = 'PRESENT')  AS present,
                COUNT(*) FILTER (WHERE ar.status = 'ABSENT')   AS absent,
                COUNT(*) FILTER (WHERE ar.status = 'LATE')     AS late,
                COUNT(*) FILTER (WHERE ar.status <> 'HOLIDAY') AS marked
         FROM attendance_records ar
         WHERE ar.tenant_id = $1 AND ar.student_id = $2 AND ${GUARDIAN_GUARD}
           AND ar.date >= make_date($4::int, $5::int, 1)
           AND ar.date <  make_date($4::int, $5::int, 1) + INTERVAL '1 month'`,
        [...args, now.getFullYear(), now.getMonth() + 1],
    );

    const { rows: feeRows } = await pool.query(
        `SELECT COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS outstanding,
                to_char(MIN(i.due_date) FILTER (WHERE i.status <> 'PAID'), 'YYYY-MM-DD') AS "nearestDueDate",
                COUNT(*) FILTER (WHERE i.status <> 'PAID' AND i.due_date < CURRENT_DATE) AS "overdueCount"
         FROM invoices i
         WHERE i.tenant_id = $1 AND i.student_id = $2 AND ${GUARDIAN_GUARD}
           AND i.status <> 'PAID'`,
        args,
    );

    const { rows: examRows } = await pool.query(
        `SELECT e.name AS "examName",
                ROUND(AVG(sr.marks_obtained::numeric / NULLIF(es.max_marks::numeric, 0)) * 100, 1) AS average,
                COUNT(*) AS "subjectCount"
         FROM student_results sr
         JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         JOIN exams e ON e.id = es.exam_id AND e.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1 AND sr.student_id = $2 AND ${GUARDIAN_GUARD}
           AND e.status = 'PUBLISHED' AND sr.is_absent = false
         GROUP BY e.id, e.name, e.start_date
         ORDER BY e.start_date DESC
         LIMIT 1`,
        args,
    );

    const { rows: alertRows } = await pool.query(
        `SELECT COUNT(*) AS unread
         FROM messages m
         WHERE m.tenant_id = $1 AND m.recipient_id = $2 AND m.status <> 'READ'`,
        [tenantId, userId],
    );

    const { rows: consentRows } = await pool.query(
        `SELECT COUNT(*) AS pending
         FROM consent_forms cf
         WHERE cf.tenant_id = $1 AND cf.is_active = true
           AND cf.audience IN ('ALL', 'PARENTS')
           AND ${GUARDIAN_GUARD}
           AND NOT EXISTS (
               SELECT 1 FROM consent_responses cr
               WHERE cr.form_id = cf.id AND cr.student_id = $2 AND cr.tenant_id = cf.tenant_id
           )`,
        args,
    );

    const { rows: transportRows } = await pool.query(
        `SELECT r.name
         FROM student_transport st
         JOIN routes r ON r.id = st.route_id AND r.tenant_id = st.tenant_id
         WHERE st.tenant_id = $1 AND st.student_id = $2 AND ${GUARDIAN_GUARD}
         ORDER BY st.start_date DESC NULLS LAST
         LIMIT 1`,
        args,
    );

    const present = Number(attRows[0]?.present ?? 0);
    const absent = Number(attRows[0]?.absent ?? 0);
    const late = Number(attRows[0]?.late ?? 0);
    const marked = Number(attRows[0]?.marked ?? 0);

    return {
        child,
        attendance: {
            present,
            absent,
            late,
            marked,
            rate: marked > 0 ? Math.round(((present + late) / marked) * 100) : null,
        },
        fees: {
            outstanding: Number(feeRows[0]?.outstanding ?? 0),
            nearestDueDate: feeRows[0]?.nearestDueDate ?? null,
            overdueCount: Number(feeRows[0]?.overdueCount ?? 0),
        },
        latestExam: examRows[0]
            ? {
                examName: String(examRows[0].examName),
                average: Number(examRows[0].average ?? 0),
                subjectCount: Number(examRows[0].subjectCount ?? 0),
            }
            : null,
        unreadAlerts: Number(alertRows[0]?.unread ?? 0),
        pendingConsents: Number(consentRows[0]?.pending ?? 0),
        transportRoute: transportRows[0]?.name ?? null,
    };
}

// ─── Attendance ──────────────────────────────────────────────

export interface ChildAttendanceRecord {
    date: string;
    status: string;
    remarks: string | null;
}

export interface ChildAttendance {
    child: ParentChild;
    month: number;
    year: number;
    records: ChildAttendanceRecord[];
}

export async function getChildAttendance(params: {
    studentId?: string | null;
    month: number;
    year: number;
}): Promise<ChildAttendance | null> {
    const scope = await resolveChild(params.studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;

    const month = Math.min(12, Math.max(1, Math.trunc(params.month)));
    const year = Math.min(2100, Math.max(2000, Math.trunc(params.year)));

    const { rows } = await pool.query(
        `SELECT to_char(ar.date, 'YYYY-MM-DD') AS date,
                ar.status::text AS status,
                ar.remarks
         FROM attendance_records ar
         WHERE ar.tenant_id = $1 AND ar.student_id = $2 AND ${GUARDIAN_GUARD}
           AND ar.date >= make_date($4::int, $5::int, 1)
           AND ar.date <  make_date($4::int, $5::int, 1) + INTERVAL '1 month'
         ORDER BY ar.date`,
        [tenantId, child.id, userId, year, month],
    );

    return {
        child,
        month,
        year,
        records: rows.map((r: ChildAttendanceRecord) => ({
            date: r.date,
            status: r.status,
            remarks: r.remarks,
        })),
    };
}

// ─── Results ─────────────────────────────────────────────────

export interface ChildResultRow {
    examId: string;
    examName: string;
    examType: string;
    examStartDate: string | null;
    publishedOn: string | null;
    subject: string;
    marksObtained: number | null;
    maxMarks: number;
    passingMarks: number | null;
    percentage: number | null;
    grade: string | null;
    remarks: string | null;
    isAbsent: boolean;
}

export interface ChildResults {
    child: ParentChild;
    results: ChildResultRow[];
}

export async function getChildResults(studentId?: string | null): Promise<ChildResults | null> {
    const scope = await resolveChild(studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;

    const { rows } = await pool.query(
        `SELECT e.id   AS "examId",
                e.name AS "examName",
                e.type::text AS "examType",
                to_char(e.start_date, 'YYYY-MM-DD')  AS "examStartDate",
                to_char(e.published_at, 'YYYY-MM-DD') AS "publishedOn",
                sub.name AS subject,
                sr.marks_obtained AS "marksObtained",
                es.max_marks      AS "maxMarks",
                es.passing_marks  AS "passingMarks",
                ROUND(sr.marks_obtained::numeric / NULLIF(es.max_marks::numeric, 0) * 100, 1) AS percentage,
                sr.grade,
                sr.remarks,
                sr.is_absent AS "isAbsent"
         FROM student_results sr
         JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         JOIN exams e     ON e.id = es.exam_id     AND e.tenant_id = sr.tenant_id
         JOIN subjects sub ON sub.id = es.subject_id AND sub.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1 AND sr.student_id = $2 AND ${GUARDIAN_GUARD}
           AND e.status = 'PUBLISHED'
         ORDER BY e.start_date DESC, sub.name`,
        [tenantId, child.id, userId],
    );

    return {
        child,
        results: rows.map((r: ChildResultRow) => ({
            ...r,
            marksObtained: r.marksObtained === null ? null : Number(r.marksObtained),
            maxMarks: Number(r.maxMarks),
            passingMarks: r.passingMarks === null ? null : Number(r.passingMarks),
            percentage: r.percentage === null ? null : Number(r.percentage),
        })),
    };
}

// ─── Fees ────────────────────────────────────────────────────

export interface ChildInvoice {
    id: string;
    invoiceNumber: string;
    description: string | null;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    dueDate: string | null;
    status: string;
    isOverdue: boolean;
}

export interface ChildPayment {
    id: string;
    amount: number;
    method: string;
    status: string;
    paidAt: string | null;
    receiptNumber: string | null;
    invoiceNumber: string;
}

export interface ChildFees {
    child: ParentChild;
    invoices: ChildInvoice[];
    payments: ChildPayment[];
}

export async function getChildFees(studentId?: string | null): Promise<ChildFees | null> {
    const scope = await resolveChild(studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;
    const args = [tenantId, child.id, userId];

    const { rows: invoices } = await pool.query(
        `SELECT i.id,
                i.invoice_number AS "invoiceNumber",
                i.description,
                i.total_amount AS "totalAmount",
                i.paid_amount  AS "paidAmount",
                to_char(i.due_date, 'YYYY-MM-DD') AS "dueDate",
                i.status::text AS status,
                (i.status <> 'PAID' AND i.due_date < CURRENT_DATE) AS "isOverdue"
         FROM invoices i
         WHERE i.tenant_id = $1 AND i.student_id = $2 AND ${GUARDIAN_GUARD}
         ORDER BY i.due_date DESC NULLS LAST, i.created_at DESC`,
        args,
    );

    const { rows: payments } = await pool.query(
        `SELECT p.id,
                p.amount,
                p.method::text AS method,
                p.status::text AS status,
                to_char(p.paid_at, 'YYYY-MM-DD') AS "paidAt",
                r.receipt_number AS "receiptNumber",
                i.invoice_number AS "invoiceNumber"
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
         LEFT JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND i.student_id = $2 AND ${GUARDIAN_GUARD}
         ORDER BY p.paid_at DESC NULLS LAST`,
        args,
    );

    return {
        child,
        invoices: invoices.map((i: ChildInvoice) => {
            const totalAmount = Number(i.totalAmount);
            const paidAmount = Number(i.paidAmount);
            return {
                ...i,
                totalAmount,
                paidAmount,
                balance: totalAmount - paidAmount,
            };
        }),
        payments: payments.map((p: ChildPayment) => ({ ...p, amount: Number(p.amount) })),
    };
}

export interface CheckoutInvoice {
    id: string;
    invoiceNumber: string;
    description: string | null;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    dueDate: string | null;
    status: string;
    studentName: string;
}

/**
 * The one invoice a checkout page is about, resolved only if it belongs to a
 * student this guardian is linked to. Returns null rather than an error so the
 * page can say plainly that it has nothing to charge for.
 */
export async function getInvoiceForCheckout(invoiceId: string): Promise<CheckoutInvoice | null> {
    const { tenantId, userId } = await requireAuth('invoices:read:own');

    // A malformed id is a miss, not a database error.
    if (!UUID_RE.test(invoiceId)) return null;

    const { rows } = await pool.query(
        `SELECT i.id,
                i.invoice_number AS "invoiceNumber",
                i.description,
                i.total_amount AS "totalAmount",
                i.paid_amount  AS "paidAmount",
                to_char(i.due_date, 'YYYY-MM-DD') AS "dueDate",
                i.status::text AS status,
                s.first_name || ' ' || s.last_name AS "studentName"
         FROM invoices i
         JOIN students s ON s.id = i.student_id AND s.tenant_id = i.tenant_id
         WHERE i.id = $2 AND i.tenant_id = $1
           AND EXISTS (
               SELECT 1 FROM guardians gd
               WHERE gd.student_id = i.student_id AND gd.user_id = $3 AND gd.tenant_id = $1
           )
         LIMIT 1`,
        [tenantId, invoiceId, userId],
    );

    const row = rows[0];
    if (!row) return null;

    const totalAmount = Number(row.totalAmount);
    const paidAmount = Number(row.paidAmount);
    return { ...row, totalAmount, paidAmount, balance: totalAmount - paidAmount };
}

// ─── Transport ───────────────────────────────────────────────

export interface ChildTransport {
    assignmentId: string;
    routeName: string;
    vehicleNumber: string;
    driverName: string | null;
    driverPhone: string | null;
    morningDeparture: string | null;
    afternoonDeparture: string | null;
    monthlyFee: number | null;
    stopName: string | null;
    pickupTime: string | null;
    dropTime: string | null;
    stopCount: number;
    startDate: string | null;
    endDate: string | null;
}

export async function getChildTransport(
    studentId?: string | null,
): Promise<{ child: ParentChild; assignments: ChildTransport[] } | null> {
    const scope = await resolveChild(studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;

    const { rows } = await pool.query(
        `SELECT st.id AS "assignmentId",
                r.name AS "routeName",
                v.vehicle_number AS "vehicleNumber",
                v.driver_name  AS "driverName",
                v.driver_phone AS "driverPhone",
                r.morning_departure_time   AS "morningDeparture",
                r.afternoon_departure_time AS "afternoonDeparture",
                r.monthly_fee AS "monthlyFee",
                stp.name        AS "stopName",
                stp.pickup_time AS "pickupTime",
                stp.drop_time   AS "dropTime",
                (SELECT COUNT(*) FROM stops s2 WHERE s2.route_id = r.id) AS "stopCount",
                st.start_date AS "startDate",
                st.end_date   AS "endDate"
         FROM student_transport st
         JOIN routes r   ON r.id = st.route_id  AND r.tenant_id = st.tenant_id
         JOIN vehicles v ON v.id = r.vehicle_id AND v.tenant_id = st.tenant_id
         LEFT JOIN stops stp ON stp.id = st.stop_id AND stp.route_id = r.id
         WHERE st.tenant_id = $1 AND st.student_id = $2 AND ${GUARDIAN_GUARD}
         ORDER BY st.start_date DESC NULLS LAST`,
        [tenantId, child.id, userId],
    );

    return {
        child,
        assignments: rows.map((r: ChildTransport) => ({
            ...r,
            monthlyFee: r.monthlyFee === null ? null : Number(r.monthlyFee),
            stopCount: Number(r.stopCount),
        })),
    };
}

// ─── Alerts ──────────────────────────────────────────────────

export interface ParentAlertItem {
    id: string;
    channel: string;
    subject: string | null;
    body: string;
    status: string;
    isRead: boolean;
    sentAt: string | null;
    createdAt: string;
}

/**
 * Alerts are addressed to the guardian's user account, not to a specific child
 * — `messages` has no student column — so this list is deliberately not
 * child-scoped.
 */
export async function getMyAlerts(): Promise<ParentAlertItem[]> {
    const { tenantId, userId } = await requireAuth('messages:read:own');

    const { rows } = await pool.query(
        `SELECT m.id,
                m.channel::text AS channel,
                m.subject,
                m.body,
                m.status::text AS status,
                (m.status = 'READ') AS "isRead",
                to_char(m.sent_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "sentAt",
                to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
         FROM messages m
         WHERE m.tenant_id = $1 AND m.recipient_id = $2
         ORDER BY COALESCE(m.sent_at, m.created_at) DESC
         LIMIT 100`,
        [tenantId, userId],
    );

    return rows as ParentAlertItem[];
}

export async function markAlertRead(messageId: string): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('messages:read:own');

    if (!UUID_RE.test(messageId)) {
        return { success: false, error: 'Alert not found.' };
    }

    const { rowCount } = await pool.query(
        `UPDATE messages
         SET status = 'READ'
         WHERE id = $1 AND tenant_id = $2 AND recipient_id = $3
           AND status IN ('QUEUED', 'SENT', 'DELIVERED')`,
        [messageId, tenantId, userId],
    );

    if (!rowCount) return { success: false, error: 'Alert not found, or it was already read.' };
    revalidatePath('/alerts');
    return { success: true };
}

export async function markAllAlertsRead(): Promise<{ success: boolean; updated: number }> {
    const { tenantId, userId } = await requireAuth('messages:read:own');

    const { rowCount } = await pool.query(
        `UPDATE messages
         SET status = 'READ'
         WHERE tenant_id = $1 AND recipient_id = $2
           AND status IN ('QUEUED', 'SENT', 'DELIVERED')`,
        [tenantId, userId],
    );

    revalidatePath('/alerts');
    return { success: true, updated: rowCount ?? 0 };
}

// ─── Consent ─────────────────────────────────────────────────

export interface ChildConsentForm {
    id: string;
    title: string;
    description: string | null;
    formType: string;
    dueDate: string | null;
    isActive: boolean;
    response: string | null;
    respondedAt: string | null;
    respondentName: string | null;
    notes: string | null;
}

export async function getChildConsentForms(
    studentId?: string | null,
): Promise<{ child: ParentChild; forms: ChildConsentForm[] } | null> {
    const scope = await resolveChild(studentId);
    if (!scope) return null;
    const { tenantId, userId, child } = scope;

    const { rows } = await pool.query(
        `SELECT cf.id,
                cf.title,
                cf.description,
                cf.form_type AS "formType",
                to_char(cf.due_date, 'YYYY-MM-DD') AS "dueDate",
                cf.is_active AS "isActive",
                latest.response::text AS response,
                to_char(latest.responded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "respondedAt",
                latest.respondent_name AS "respondentName",
                latest.notes
         FROM consent_forms cf
         LEFT JOIN LATERAL (
             SELECT cr.response, cr.responded_at, cr.respondent_name, cr.notes
             FROM consent_responses cr
             WHERE cr.form_id = cf.id AND cr.student_id = $2 AND cr.tenant_id = cf.tenant_id
             ORDER BY cr.responded_at DESC
             LIMIT 1
         ) latest ON TRUE
         WHERE cf.tenant_id = $1
           AND cf.audience IN ('ALL', 'PARENTS')
           AND ${GUARDIAN_GUARD}
         ORDER BY cf.is_active DESC, cf.due_date NULLS LAST, cf.created_at DESC`,
        [tenantId, child.id, userId],
    );

    return { child, forms: rows as ChildConsentForm[] };
}

/**
 * Record this guardian's answer to one consent form, for one of their own
 * children. The whole decision is made inside a single statement so an
 * unrelated student id, an inactive form, or a form from another tenant simply
 * affects zero rows and is reported back as a failure.
 */
export async function respondToConsentForm(input: {
    formId: string;
    studentId: string;
    response: 'ACCEPTED' | 'DECLINED';
    notes?: string;
}): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('consent:write:own');

    if (input.response !== 'ACCEPTED' && input.response !== 'DECLINED') {
        return { success: false, error: 'Response must be ACCEPTED or DECLINED.' };
    }

    if (!UUID_RE.test(input.formId) || !UUID_RE.test(input.studentId)) {
        return { success: false, error: 'That consent form could not be found.' };
    }

    const children = await getMyChildren();
    const child = children.find((c) => c.id === input.studentId);
    if (!child) {
        return { success: false, error: 'That student is not linked to your account.' };
    }

    const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null;

    const { rows } = await pool.query(
        `WITH target AS (
             SELECT cf.id
             FROM consent_forms cf
             WHERE cf.id = $3 AND cf.tenant_id = $1
               AND cf.is_active = true
               AND cf.audience IN ('ALL', 'PARENTS')
         ), guard AS (
             SELECT gd.first_name || ' ' || gd.last_name AS respondent
             FROM guardians gd
             WHERE gd.student_id = $2 AND gd.user_id = $4 AND gd.tenant_id = $1
             ORDER BY gd.is_primary DESC
             LIMIT 1
         ), updated AS (
             UPDATE consent_responses cr
             SET response = $5::consent_response,
                 responded_at = NOW(),
                 respondent_name = (SELECT respondent FROM guard),
                 notes = $6
             WHERE cr.tenant_id = $1 AND cr.form_id = $3 AND cr.student_id = $2
               AND EXISTS (SELECT 1 FROM target)
               AND EXISTS (SELECT 1 FROM guard)
             RETURNING cr.id
         ), inserted AS (
             INSERT INTO consent_responses (tenant_id, form_id, student_id, respondent_name, response, notes)
             SELECT $1, $3, $2, (SELECT respondent FROM guard), $5::consent_response, $6
             WHERE NOT EXISTS (SELECT 1 FROM updated)
               AND EXISTS (SELECT 1 FROM target)
               AND EXISTS (SELECT 1 FROM guard)
             RETURNING id
         )
         SELECT (SELECT COUNT(*) FROM updated) + (SELECT COUNT(*) FROM inserted) AS affected`,
        [tenantId, input.studentId, input.formId, userId, input.response, notes],
    );

    if (Number(rows[0]?.affected ?? 0) === 0) {
        return { success: false, error: 'This form is no longer open for responses.' };
    }

    revalidatePath('/parent-consent');
    revalidatePath('/overview');
    return { success: true };
}
