import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    outstandingMinor,
} from '@/lib/payments/ledger';
import { getRazorpayGateway } from '@/lib/payments/providers';

export const dynamic = 'force-dynamic';

const OrderRequestSchema = z.object({
    invoiceId: z.string().uuid(),
    amountInPaise: z.number().int().positive().optional(),
    description: z.string().trim().max(255).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
        if (auth.ok === false) return auth.response;

        const json = await readTenantScopedJson(request, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = OrderRequestSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: 'Invalid order request' }, { status: 400 });
        }

        const invoice = await findInvoiceForPayment(
            parsed.data.invoiceId,
            auth.context.tenantId,
            auth.context.userId,
            auth.context.role,
        );
        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
        }

        const outstandingInPaise = outstandingMinor(invoice);
        const amountInPaise = parsed.data.amountInPaise ?? outstandingInPaise;
        if (amountInPaise <= 0 || amountInPaise > outstandingInPaise || invoice.status === 'PAID') {
            return NextResponse.json({ success: false, error: 'Invalid payment amount' }, { status: 400 });
        }

        const existingOrder = await getPaymentOrderByIdempotency(
            auth.context.tenantId,
            'RAZORPAY',
            invoice.id,
            amountInPaise,
            'INR',
        );
        if (existingOrder?.providerOrderId) {
            return NextResponse.json({
                success: true,
                data: {
                    orderId: existingOrder.providerOrderId,
                    amount: existingOrder.amountMinor,
                    currency: existingOrder.currency,
                    keyId: getRazorpayGateway().keyId,
                    description: parsed.data.description || 'Fee Payment',
                    reused: true,
                },
            });
        }

        const gateway = getRazorpayGateway();
        const providerOrder = await gateway.createOrder({
            amountMinor: amountInPaise,
            currency: 'INR',
            receipt: invoice.invoiceNumber || invoice.id,
            notes: {
                invoiceId: invoice.id,
                tenantId: auth.context.tenantId,
                studentId: invoice.studentId,
                requestedBy: auth.context.userId,
            },
        });

        await createPaymentOrderRecord({
            tenantId: auth.context.tenantId,
            invoice,
            provider: 'RAZORPAY',
            amountMinor: providerOrder.amountMinor,
            currency: providerOrder.currency,
            providerOrderId: providerOrder.providerOrderId,
            createdBy: auth.context.userId,
            metadata: {
                description: parsed.data.description || 'Fee Payment',
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                orderId: providerOrder.providerOrderId,
                amount: providerOrder.amountMinor,
                currency: providerOrder.currency,
                keyId: providerOrder.publicKey,
                description: parsed.data.description || 'Fee Payment',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Payment order creation failed';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
