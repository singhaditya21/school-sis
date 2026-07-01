import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    minorFromAmount,
    outstandingMinor,
} from '@/lib/payments/ledger';
import { getStripeGateway } from '@/lib/payments/providers';

export const dynamic = 'force-dynamic';

const StripeCheckoutSchema = z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive().optional(),
    currency: z.string().trim().length(3).default('USD'),
    title: z.string().trim().max(255).optional(),
});

function appUrlFromRequest(request: Request): string {
    return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function POST(req: Request) {
    const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
    if (auth.ok === false) return auth.response;

    try {
        const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = StripeCheckoutSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid checkout request' }, { status: 400 });
        }

        const invoice = await findInvoiceForPayment(
            parsed.data.invoiceId,
            auth.context.tenantId,
            auth.context.userId,
            auth.context.role,
        );
        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        const outstanding = outstandingMinor(invoice);
        const requestedAmount = parsed.data.amount ? minorFromAmount(parsed.data.amount) : outstanding;
        if (requestedAmount <= 0 || requestedAmount > outstanding || invoice.status === 'PAID') {
            return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
        }

        const currency = parsed.data.currency.toUpperCase();
        const gateway = getStripeGateway();
        const existingOrder = await getPaymentOrderByIdempotency(
            auth.context.tenantId,
            'STRIPE',
            invoice.id,
            requestedAmount,
            currency,
        );
        if (existingOrder?.providerOrderId) {
            const session = await gateway.retrieveCheckoutSession(existingOrder.providerOrderId);
            return NextResponse.json({
                url: session.checkoutUrl,
                sessionId: session.providerOrderId,
                reused: true,
            });
        }

        const baseUrl = appUrlFromRequest(req);
        const session = await gateway.createCheckoutSession({
            amountMinor: requestedAmount,
            currency,
            receipt: invoice.invoiceNumber || invoice.id,
            title: parsed.data.title || 'ScholarMind Fee Payment',
            successUrl: `${baseUrl}/parent/fees?status=success`,
            cancelUrl: `${baseUrl}/parent/fees?status=canceled`,
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
            provider: 'STRIPE',
            amountMinor: session.amountMinor,
            currency: session.currency,
            providerOrderId: session.providerOrderId,
            createdBy: auth.context.userId,
            metadata: {
                title: parsed.data.title || 'ScholarMind Fee Payment',
                checkoutUrl: session.checkoutUrl,
            },
        });

        return NextResponse.json({ url: session.checkoutUrl, sessionId: session.providerOrderId });
    } catch (error) {
        console.error('[Stripe] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Failed to initialize payment gateway' }, { status: 500 });
    }
}
