import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    completeProviderPayment,
    findInvoiceForPayment,
    getPaymentOrderByProviderOrder,
} from '@/lib/payments/ledger';
import { getRazorpayGateway } from '@/lib/payments/providers';

export const dynamic = 'force-dynamic';

const VerifyPaymentSchema = z.object({
    invoiceId: z.string().uuid(),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid payment signature format'),
});

export async function POST(request: NextRequest) {
    const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
    if (auth.ok === false) return auth.response;

    try {
        const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = VerifyPaymentSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.errors[0]?.message || 'Invalid payment verification request' },
                { status: 400 },
            );
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

        const order = await getPaymentOrderByProviderOrder(
            auth.context.tenantId,
            'RAZORPAY',
            parsed.data.razorpayOrderId,
        );
        if (!order || order.invoiceId !== invoice.id) {
            return NextResponse.json({ success: false, error: 'Payment order not found' }, { status: 404 });
        }

        const gateway = getRazorpayGateway();
        const verified = gateway.verifyPaymentSignature(
            parsed.data.razorpayOrderId,
            parsed.data.razorpayPaymentId,
            parsed.data.razorpaySignature,
        );
        if (!verified) {
            return NextResponse.json(
                { success: false, error: 'Payment signature verification failed.' },
                { status: 403 },
            );
        }

        const result = await completeProviderPayment({
            tenantId: auth.context.tenantId,
            invoiceId: invoice.id,
            provider: 'RAZORPAY',
            providerOrderId: parsed.data.razorpayOrderId,
            providerPaymentId: parsed.data.razorpayPaymentId,
            amountMinor: order.amountMinor,
            currency: order.currency,
            actorUserId: auth.context.userId,
            metadata: {
                source: 'client_verify',
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                verified: true,
                paymentId: result.paymentId,
                invoiceId: invoice.id,
                alreadyProcessed: result.alreadyProcessed,
            },
        });
    } catch (error) {
        console.error('[Payment Verify] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json(
            { success: false, error: 'Payment verification failed due to an internal error' },
            { status: 500 },
        );
    }
}
