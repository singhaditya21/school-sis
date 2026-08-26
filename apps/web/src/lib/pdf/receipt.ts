import { pool } from '@/lib/db';
import { amountInWords } from '@/app/(admin)/receipts/amount-in-words';
import type { ReceiptDetail } from '@/app/(admin)/receipts/receipt-data';
import {
    EMPTY,
    filenameSlug,
    formatPdfDate,
    formatRupees,
    orEmpty,
} from './format';
import {
    CONTENT_WIDTH,
    GOOD,
    MUTED,
    PdfBuilder,
    WARN,
    drawLetterhead,
} from './layout';

/**
 * Fee receipt PDF, generated in-process.
 *
 * The document mirrors /receipts/[id] field for field — same query, same
 * derived values — so the printed page and the downloaded PDF cannot disagree
 * about what a parent paid.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METHOD_LABELS: Record<string, string> = {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK_TRANSFER: 'Bank Transfer',
    CHEQUE: 'Cheque',
    CARD: 'Card',
    ONLINE: 'Online',
};

function methodLabel(method: string): string {
    return METHOD_LABELS[method] ?? method;
}

/** The reference a parent would quote back to the school for this payment. */
function paymentReference(receipt: ReceiptDetail): string | null {
    if (receipt.method === 'CHEQUE') return receipt.chequeNumber;
    return receipt.transactionId ?? receipt.razorpayPaymentId ?? receipt.chequeNumber;
}

/**
 * Tenant-scoped read of everything the receipt document needs. This repeats the
 * projection used by the receipts page rather than calling it, because the page
 * helper resolves its own session and redirects on failure — behaviour an API
 * route must not inherit.
 */
export async function loadReceiptForPdf(
    receiptId: string,
    tenantId: string,
): Promise<ReceiptDetail | null> {
    if (!UUID_RE.test(receiptId) || !UUID_RE.test(tenantId)) return null;

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

/** Resolve a payment id to the receipt issued against it, tenant-scoped. */
export async function findReceiptIdForPayment(
    paymentId: string,
    tenantId: string,
): Promise<string | null> {
    if (!UUID_RE.test(paymentId) || !UUID_RE.test(tenantId)) return null;

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

export function receiptPdfFilename(receipt: ReceiptDetail): string {
    return `receipt-${filenameSlug(receipt.receiptNumber, receipt.id)}.pdf`;
}

export function renderReceiptPdf(receipt: ReceiptDetail): Uint8Array {
    const amount = Number(receipt.amount);
    const invoiceTotal = Number(receipt.invoiceTotal);
    const invoicePaid = Number(receipt.invoicePaid);
    const invoiceBalance = invoiceTotal - invoicePaid;
    const words = amountInWords(receipt.amount);
    const reference = paymentReference(receipt);
    const className = [receipt.gradeName, receipt.sectionName].filter(Boolean).join(' - ');

    const builder = new PdfBuilder(
        `Fee Receipt ${receipt.receiptNumber}`,
        `Fee receipt for ${receipt.studentFirstName} ${receipt.studentLastName}`,
    );

    drawLetterhead(builder, {
        name: receipt.schoolName,
        addressLine: [
            receipt.schoolAddress,
            receipt.schoolCity,
            receipt.schoolState,
            receipt.schoolPincode,
        ]
            .filter(Boolean)
            .join(', '),
        contactLine: [
            receipt.schoolPhone ? `Phone: ${receipt.schoolPhone}` : null,
            receipt.schoolEmail ? `Email: ${receipt.schoolEmail}` : null,
            receipt.affiliationBoard ? `Board: ${receipt.affiliationBoard}` : null,
            receipt.udiseCode ? `UDISE: ${receipt.udiseCode}` : null,
        ]
            .filter(Boolean)
            .join('  -  '),
    });

    builder.text('FEE RECEIPT', { size: 12, bold: true, align: 'center', gap: 10 });

    if (receipt.status !== 'COMPLETED') {
        builder.banner(`Payment ${receipt.status} - this receipt does not confirm cleared funds.`);
    }

    builder.fieldGrid(
        [
            { label: 'Receipt No.', value: orEmpty(receipt.receiptNumber) },
            { label: 'Receipt Date', value: formatPdfDate(receipt.issuedAt) },
            {
                label: 'Student',
                value: orEmpty(`${receipt.studentFirstName} ${receipt.studentLastName}`.trim()),
            },
            { label: 'Admission No.', value: orEmpty(receipt.admissionNumber) },
            { label: 'Class', value: orEmpty(className) },
            { label: 'Invoice No.', value: orEmpty(receipt.invoiceNumber) },
        ],
        2,
    );

    builder.space(6);
    builder.table(
        [
            { header: 'Particulars', width: 0.72 },
            { header: 'Amount', width: 0.28, align: 'right' },
        ],
        [
            {
                cells: [
                    receipt.invoiceDescription || 'School fees',
                    formatRupees(amount),
                ],
                note: `Against invoice ${receipt.invoiceNumber} - due ${formatPdfDate(receipt.invoiceDueDate)}`,
            },
            {
                cells: ['Amount received', formatRupees(amount)],
                emphasis: true,
                band: true,
            },
        ],
    );

    if (words) {
        builder.space(8);
        builder.text(`In words: ${words}`, { size: 9.5, bold: true });
    }

    builder.rule(12, 10);
    builder.fieldGrid(
        [
            { label: 'Payment Method', value: methodLabel(receipt.method) },
            { label: 'Payment Date', value: formatPdfDate(receipt.paidAt) },
            { label: 'Reference', value: orEmpty(reference) },
            { label: 'Bank', value: orEmpty(receipt.bankName) },
        ],
        2,
    );

    if (receipt.notes) {
        builder.text(`Note: ${receipt.notes}`, { size: 8.5, color: MUTED, gap: 4 });
    }

    builder.rule(6, 10);
    builder.sectionLabel('Invoice position after this payment');
    builder.fieldGrid(
        [
            { label: 'Invoice total', value: formatRupees(invoiceTotal) },
            { label: 'Paid to date', value: formatRupees(invoicePaid) },
            { label: 'Balance due', value: formatRupees(invoiceBalance) },
        ],
        3,
    );

    // Restate the balance in the colour a reader expects, since the grid above
    // is deliberately uniform.
    builder.text(
        invoiceBalance > 0
            ? `Balance outstanding on invoice ${receipt.invoiceNumber}: ${formatRupees(invoiceBalance)}`
            : `Invoice ${receipt.invoiceNumber} is settled in full.`,
        { size: 9, bold: true, color: invoiceBalance > 0 ? WARN : GOOD, width: CONTENT_WIDTH },
    );

    builder.signature(
        receipt.schoolName,
        'This is a computer-generated receipt and is valid without a signature. Please retain it for your records.',
    );

    return builder.finish(
        `${receipt.schoolName} - Receipt ${receipt.receiptNumber || EMPTY}`,
    );
}
