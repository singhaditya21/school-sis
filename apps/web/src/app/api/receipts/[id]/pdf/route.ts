import { NextResponse } from 'next/server';
import { pool, runWithTenantContext } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { logger, requestContextFrom } from '@/lib/observability/logger';
import { renderReceiptPdf } from '@/lib/pdf/native';
import { isValidTenantId } from '@/lib/tenant/isolation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STAFF_ROLES = new Set([
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'FINANCE_LEAD',
  'ACCOUNTANT',
]);

type ReceiptRow = {
  receiptNumber: string;
  issuedAt: Date;
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  amount: string;
  method: string;
  transactionId: string | null;
  invoiceNumber: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;
  if (!isValidTenantId(id)) {
    return NextResponse.json({ error: 'Invalid receipt id.' }, { status: 400 });
  }

  try {
    const receipt = await runWithTenantContext(auth.context.tenantId, async () => {
      const { rows } = await pool.query<ReceiptRow>(
        `SELECT r.receipt_number AS "receiptNumber",
                r.issued_at AS "issuedAt",
                t.name AS "schoolName",
                CONCAT_WS(' ', s.first_name, s.last_name) AS "studentName",
                s.admission_number AS "admissionNumber",
                p.amount,
                p.method,
                p.transaction_id AS "transactionId",
                i.invoice_number AS "invoiceNumber"
         FROM receipts r
         JOIN payments p ON p.id = r.payment_id AND p.tenant_id = r.tenant_id
         JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = r.tenant_id
         JOIN students s ON s.id = p.student_id AND s.tenant_id = r.tenant_id
         JOIN tenants t ON t.id = r.tenant_id
         WHERE r.tenant_id = $1
           AND r.id = $2
           AND (
             $3::boolean
             OR s.user_id = $4
             OR EXISTS (
               SELECT 1 FROM guardians g
               WHERE g.tenant_id = r.tenant_id
                 AND g.student_id = s.id
                 AND g.user_id = $4
             )
           )
         LIMIT 1`,
        [auth.context.tenantId, id, STAFF_ROLES.has(auth.context.role), auth.context.userId],
      );
      return rows[0] ?? null;
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    }

    const pdf = renderReceiptPdf(receipt);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('receipt.pdf_generation_failed', 'Native receipt PDF generation failed', {
      ...requestContextFrom(request),
      tenantId: auth.context.tenantId,
      actorUserId: auth.context.userId,
      entityType: 'receipt',
      entityId: id,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json({ error: 'Failed to generate receipt PDF.' }, { status: 500 });
  }
}
