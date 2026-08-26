import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

/**
 * /receipts is gated at the route level for all tenant staff, but only finance
 * roles may read fee data. Send everyone else to /unauthorized rather than
 * throwing them into the error boundary.
 */
async function requireFeesRead(): Promise<{ tenantId: string }> {
    const { tenantId, session } = await requireAuth();
    if (!hasPermission(session.role as UserRole, 'fees:read')) {
        redirect('/unauthorized');
    }
    return { tenantId };
}

/**
 * One row of the payment ledger. `receiptId` is null when a payment has not
 * been receipted yet (e.g. a pending or failed transaction) — the list must
 * not offer a receipt link in that case.
 */
export type LedgerRow = {
    paymentId: string;
    receiptId: string | null;
    receiptNumber: string | null;
    amount: string;
    method: string;
    status: string;
    paidAt: Date | string;
    invoiceId: string;
    invoiceNumber: string | null;
    studentFirstName: string | null;
    studentLastName: string | null;
    admissionNumber: string | null;
};

export async function getReceiptLedger(limit = 100): Promise<LedgerRow[]> {
    const { tenantId } = await requireFeesRead();

    const { rows } = await pool.query<LedgerRow>(
        `SELECT
            p.id                AS "paymentId",
            r.id                AS "receiptId",
            r.receipt_number    AS "receiptNumber",
            p.amount,
            p.method,
            p.status,
            p.paid_at           AS "paidAt",
            p.invoice_id        AS "invoiceId",
            i.invoice_number    AS "invoiceNumber",
            s.first_name        AS "studentFirstName",
            s.last_name         AS "studentLastName",
            s.admission_number  AS "admissionNumber"
        FROM payments p
        LEFT JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
        LEFT JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
        LEFT JOIN students s ON s.id = i.student_id AND s.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
        ORDER BY p.paid_at DESC
        LIMIT $2`,
        [tenantId, limit],
    );

    return rows;
}

/**
 * Everything a parent-facing receipt document needs: issuing school, student,
 * the invoice it settles, and how the money actually arrived.
 */
export type ReceiptDetail = {
    id: string;
    receiptNumber: string;
    issuedAt: Date | string;
    paymentId: string;
    amount: string;
    method: string;
    status: string;
    transactionId: string | null;
    razorpayPaymentId: string | null;
    chequeNumber: string | null;
    bankName: string | null;
    notes: string | null;
    paidAt: Date | string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceTotal: string;
    invoicePaid: string;
    invoiceDueDate: Date | string;
    invoiceStatus: string;
    invoiceDescription: string | null;
    studentId: string;
    studentFirstName: string;
    studentLastName: string;
    admissionNumber: string;
    gradeName: string | null;
    sectionName: string | null;
    schoolName: string;
    schoolAddress: string | null;
    schoolCity: string | null;
    schoolState: string | null;
    schoolPincode: string | null;
    schoolPhone: string | null;
    schoolEmail: string | null;
    affiliationBoard: string | null;
    udiseCode: string | null;
};

export async function getReceiptDocument(receiptId: string): Promise<ReceiptDetail | null> {
    if (!isUuid(receiptId)) return null;
    const { tenantId } = await requireFeesRead();

    const { rows } = await pool.query<ReceiptDetail>(
        `SELECT
            r.id,
            r.receipt_number        AS "receiptNumber",
            r.issued_at             AS "issuedAt",
            p.id                    AS "paymentId",
            p.amount,
            p.method,
            p.status,
            p.transaction_id        AS "transactionId",
            p.razorpay_payment_id   AS "razorpayPaymentId",
            p.cheque_number         AS "chequeNumber",
            p.bank_name             AS "bankName",
            p.notes,
            p.paid_at               AS "paidAt",
            i.id                    AS "invoiceId",
            i.invoice_number        AS "invoiceNumber",
            i.total_amount          AS "invoiceTotal",
            i.paid_amount           AS "invoicePaid",
            i.due_date              AS "invoiceDueDate",
            i.status                AS "invoiceStatus",
            i.description           AS "invoiceDescription",
            s.id                    AS "studentId",
            s.first_name            AS "studentFirstName",
            s.last_name             AS "studentLastName",
            s.admission_number      AS "admissionNumber",
            g.name                  AS "gradeName",
            sec.name                AS "sectionName",
            t.name                  AS "schoolName",
            t.address               AS "schoolAddress",
            t.city                  AS "schoolCity",
            t.state                 AS "schoolState",
            t.pincode               AS "schoolPincode",
            t.phone                 AS "schoolPhone",
            t.email                 AS "schoolEmail",
            t.affiliation_board     AS "affiliationBoard",
            t.udise_code            AS "udiseCode"
        FROM receipts r
        INNER JOIN payments p ON p.id = r.payment_id AND p.tenant_id = r.tenant_id
        INNER JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = r.tenant_id
        INNER JOIN students s ON s.id = i.student_id AND s.tenant_id = r.tenant_id
        INNER JOIN tenants t ON t.id = r.tenant_id
        LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = r.tenant_id
        LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = r.tenant_id
        WHERE r.id = $1 AND r.tenant_id = $2`,
        [receiptId, tenantId],
    );

    return rows.length > 0 ? rows[0] : null;
}

/**
 * Resolve a payment id to the receipt issued against it. Used to keep older
 * links that carried a payment id into /receipts/[id] working.
 */
export async function getReceiptIdForPayment(paymentId: string): Promise<string | null> {
    if (!isUuid(paymentId)) return null;
    const { tenantId } = await requireFeesRead();

    const { rows } = await pool.query<{ id: string }>(
        `SELECT r.id
         FROM receipts r
         WHERE r.payment_id = $1 AND r.tenant_id = $2
         ORDER BY r.issued_at DESC
         LIMIT 1`,
        [paymentId, tenantId],
    );

    return rows.length > 0 ? rows[0].id : null;
}
