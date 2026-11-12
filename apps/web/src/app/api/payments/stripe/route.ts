import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { getSession } from '@/lib/auth/session';
import { resolveTrustedAppOrigin } from '@/lib/security/client-ip';
import { isDemoSession, isDemoTenantCode } from '@/lib/tenant/demo-guard';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    isPayableInvoiceStatus,
    minorFromAmount,
    outstandingMinor,
} from '@/lib/payments/ledger';
import { getStripeGateway } from '@/lib/payments/providers';

export const dynamic = 'force-dynamic';

const StripeCheckoutSchema = z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive().optional(),
    currency: z.literal('INR').default('INR'),
    title: z.string().trim().max(255).optional(),
});

export async function POST(req: Request) {
    const auth = await requireApiAuth([
        'PARENT',
        'FINANCE_LEAD',
        'ACCOUNTANT',
        'SCHOOL_ADMIN',
        'SUPER_ADMIN',
        'PLATFORM_ADMIN',
    ]);
    if (auth.ok === false) return auth.response;

    try {
        const liveSession = await getSession().catch(() => null);
        if (
            isDemoSession(auth.context as { isDemoSandbox?: boolean; tenantCode?: string | null }) ||
            isDemoSession(liveSession)
        ) {
            return NextResponse.json(
                { error: 'Live payment gateway checkout is disabled in the public demo sandbox.' },
                { status: 403 },
            );
        }

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

        if (Boolean(invoice.tenantIsDemo) || isDemoTenantCode(invoice.tenantCode)) {
            return NextResponse.json(
                { error: 'Live payment gateway checkout is disabled in the public demo sandbox.' },
                { status: 403 },
            );
        }

        if (!isPayableInvoiceStatus(invoice.status)) {
            return NextResponse.json(
                { error: `Invoice with status ${invoice.status} cannot accept payments` },
                { status: 400 },
            );
        }

        const outstanding = outstandingMinor(invoice);
        const requestedAmount = parsed.data.amount ? minorFromAmount(parsed.data.amount) : outstanding;
        if (requestedAmount <= 0 || requestedAmount > outstanding) {
            return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
        }

        if (auth.context.role === 'PARENT' && requestedAmount < outstanding) {
            return NextResponse.json(
                {
                    error: 'Parents must pay the full remaining invoice balance unless an installment order is created by finance staff.',
                },
                { status: 400 },
            );
        }

        const stripeAccountId = invoice.stripeConnectAccountId?.trim() || undefined;
        const currency = 'INR' as const;
        const gateway = getStripeGateway();
        const existingOrder = await getPaymentOrderByIdempotency(
            auth.context.tenantId,
            'STRIPE',
            invoice.id,
            requestedAmount,
            currency,
        );
        if (existingOrder?.providerOrderId) {
            const session = await gateway.retrieveCheckoutSession(existingOrder.providerOrderId, stripeAccountId);
            if (session.status === 'open' && session.checkoutUrl) {
                return NextResponse.json({
                    url: session.checkoutUrl,
                    sessionId: session.providerOrderId,
                    reused: true,
                });
            }
        }

        const baseUrl = resolveTrustedAppOrigin(req.url);
        const session = await gateway.createCheckoutSession({
            amountMinor: requestedAmount,
            currency,
            receipt: invoice.invoiceNumber || invoice.id,
            title: parsed.data.title || 'ScholarMind Fee Payment',
            successUrl: `${baseUrl}/parent/fees?status=success`,
            cancelUrl: `${baseUrl}/parent/fees?status=canceled`,
            stripeAccount: stripeAccountId,
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
            currency,
            providerOrderId: session.providerOrderId,
            createdBy: auth.context.userId,
            metadata: {
                title: parsed.data.title || 'ScholarMind Fee Payment',
                checkoutUrl: session.checkoutUrl,
                ...(stripeAccountId ? { stripeConnectAccountId: stripeAccountId } : {}),
            },
        });

        return NextResponse.json({ url: session.checkoutUrl, sessionId: session.providerOrderId });
    } catch (error) {
        console.error('[Stripe] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Failed to initialize payment gateway' }, { status: 500 });
    }
}
