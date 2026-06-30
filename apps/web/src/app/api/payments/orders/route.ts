import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

export const dynamic = 'force-dynamic';

const OrderRequestSchema = z.object({
    invoiceId: z.string().uuid(),
    amountInPaise: z.number().int().positive().optional(),
    description: z.string().trim().max(255).optional(),
});

async function assertInvoiceAccess(
    invoiceId: string,
    tenantId: string,
    userId: string,
    role: string
) {
    const parentOnlyClause = role === 'PARENT'
        ? 'AND EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = i.student_id AND g.tenant_id = i.tenant_id AND g.user_id = $3)'
        : '';

    const { rows } = await pool.query(
        `SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount
         FROM invoices i
         WHERE i.id = $1
           AND i.tenant_id = $2
           ${parentOnlyClause}
         LIMIT 1`,
        role === 'PARENT' ? [invoiceId, tenantId, userId] : [invoiceId, tenantId]
    );

    return rows[0] as {
        id: string;
        invoice_number: string;
        total_amount: string;
        paid_amount: string | null;
    } | undefined;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
        if (auth.ok === false) return auth.response;

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            return NextResponse.json({ success: false, error: 'Razorpay is not configured' }, { status: 503 });
        }

        const json = await readTenantScopedJson(request, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = OrderRequestSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: 'Invalid order request' }, { status: 400 });
        }

        const invoice = await assertInvoiceAccess(
            parsed.data.invoiceId,
            auth.context.tenantId,
            auth.context.userId,
            auth.context.role
        );

        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
        }

        const outstandingInPaise = Math.max(
            0,
            Math.round((Number(invoice.total_amount) - Number(invoice.paid_amount || 0)) * 100)
        );
        const amountInPaise = parsed.data.amountInPaise ?? outstandingInPaise;

        if (amountInPaise <= 0 || amountInPaise > outstandingInPaise) {
            return NextResponse.json({ success: false, error: 'Invalid payment amount' }, { status: 400 });
        }

        const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: 'INR',
                receipt: invoice.invoice_number || invoice.id,
                notes: {
                    invoiceId: invoice.id,
                    tenantId: auth.context.tenantId,
                    requestedBy: auth.context.userId,
                },
            }),
        });

        const order = await razorpayResponse.json();
        if (!razorpayResponse.ok) {
            return NextResponse.json(
                { success: false, error: order?.error?.description || 'Razorpay order creation failed' },
                { status: 502 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId,
                description: parsed.data.description || 'Fee Payment',
            },
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
