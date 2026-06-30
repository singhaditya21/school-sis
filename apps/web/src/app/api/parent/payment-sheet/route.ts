import { NextResponse } from 'next/server';
import { PaymentRoutingService } from '@/lib/services/payments';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { z } from 'zod';

const PaymentSheetSchema = z.object({
  invoiceId: z.string().uuid(),
  parentCustomerId: z.string().trim().min(1).max(255),
  amountInCents: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth(['PARENT']);
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = PaymentSheetSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payment request" }, { status: 400 });
    }

    const { invoiceId, parentCustomerId } = parsed.data;

    const invoiceRes = await pool.query(
      `SELECT
         i.id,
         i.total_amount,
         i.paid_amount,
         t.stripe_connect_account_id
       FROM invoices i
       JOIN tenants t ON t.id = i.tenant_id
       JOIN guardians g ON g.student_id = i.student_id AND g.tenant_id = i.tenant_id
       WHERE i.id = $1
         AND i.tenant_id = $2
         AND g.user_id = $3
       LIMIT 1`,
      [invoiceId, auth.context.tenantId, auth.context.userId]
    );

    if (invoiceRes.rowCount === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const invoice = invoiceRes.rows[0];
    const schoolAccountId = invoice.stripe_connect_account_id;
    if (!schoolAccountId) {
      return NextResponse.json({ error: "School payment account is not configured" }, { status: 503 });
    }

    const outstandingInCents = Math.max(
      0,
      Math.round((Number(invoice.total_amount) - Number(invoice.paid_amount || 0)) * 100)
    );
    const amountInCents = parsed.data.amountInCents ?? outstandingInCents;

    if (amountInCents <= 0 || amountInCents > outstandingInCents) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    const paymentIntent = await PaymentRoutingService.processTuitionPayment(
      parentCustomerId,
      schoolAccountId,
      amountInCents,
      `Tuition Payment for invoice ${invoiceId}`
    );

    return NextResponse.json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: null,
      customer: parentCustomerId,
    });
  } catch (error: any) {
    console.error("Failed to generate payment sheet parameters:", error);
    return NextResponse.json({ error: error.message || "Stripe Connection Error" }, { status: 500 });
  }
}
