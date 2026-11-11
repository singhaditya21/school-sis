'use server';

import { sql } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/middleware';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    isPayableInvoiceStatus,
    outstandingMinor,
} from '@/lib/payments/ledger';
import { getStripeClient } from '@/lib/payments/providers';

type MiddlewareUserRole = Parameters<typeof requireRole>[number];

const CONNECT_ADMIN_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
] as unknown as readonly MiddlewareUserRole[];

function resolveTrustedOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) {
        const parsed = new URL(configured);
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
            throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS in production.');
        }
        return parsed.origin;
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('NEXT_PUBLIC_APP_URL must be configured in production.');
    }
    return 'http://localhost:3000';
}

export async function createCheckoutSession(invoiceId: string) {
    const { tenantId, userId, session: authSession } = await requireAuth();

    const invoice = await findInvoiceForPayment(
        invoiceId,
        tenantId,
        userId,
        authSession.role,
    );

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    if (!isPayableInvoiceStatus(invoice.status)) {
        throw new Error(`Invoice with status ${invoice.status} cannot accept payments`);
    }

    // Get tenant's Stripe Connect Account ID
    const tenantRows = await sql<{ stripe_connect_account_id: string | null }>`
        SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}
    `;
    if (tenantRows.length === 0 || !tenantRows[0].stripe_connect_account_id) {
        throw new Error('School has not configured payment processing yet.');
    }
    const stripeAccountId = tenantRows[0].stripe_connect_account_id;
    const amountInPaise = outstandingMinor(invoice);
    if (amountInPaise <= 0) {
        throw new Error('Invoice has no outstanding balance.');
    }

    const origin = resolveTrustedOrigin();
    const stripe = getStripeClient();
    const existingOrder = await getPaymentOrderByIdempotency(tenantId, 'STRIPE', invoice.id, amountInPaise, 'INR');
    if (existingOrder?.providerOrderId) {
        const existingSession = await stripe.checkout.sessions.retrieve(
            existingOrder.providerOrderId,
            {},
            { stripeAccount: stripeAccountId },
        );
        if (existingSession.status === 'open' && existingSession.url) {
            return { url: existingSession.url };
        }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: `Invoice #${invoice.invoiceNumber}`,
                    },
                    unit_amount: amountInPaise,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${origin}/my-fees?success=true`,
        cancel_url: `${origin}/my-fees?canceled=true`,
        metadata: {
            invoiceId: invoice.id,
            tenantId,
            studentId: invoice.studentId,
            requestedBy: userId,
        },
    }, { stripeAccount: stripeAccountId });

    if (!checkoutSession.url) {
        throw new Error('Failed to create Stripe session');
    }

    await createPaymentOrderRecord({
        tenantId,
        invoice,
        provider: 'STRIPE',
        amountMinor: checkoutSession.amount_total || amountInPaise,
        currency: 'INR',
        providerOrderId: checkoutSession.id,
        createdBy: userId,
        metadata: {
            stripeConnectAccountId: stripeAccountId,
            checkoutUrl: checkoutSession.url,
            source: 'parent_server_action',
        },
    });

    return { url: checkoutSession.url };
}

export async function createStripeConnectAccount() {
    const { tenantId, session } = await requireRole(...CONNECT_ADMIN_ROLES);
    if (!(CONNECT_ADMIN_ROLES as readonly string[]).includes(session.role)) {
        throw new Error('Forbidden: Administrator role required to configure Stripe Connect.');
    }

    const rows = await sql<{ stripe_connect_account_id: string | null }>`
        SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}
    `;
    let accountId = rows[0]?.stripe_connect_account_id;

    if (!accountId) {
        const stripe = getStripeClient();
        const account = await stripe.accounts.create({ type: 'standard' });
        accountId = account.id;
        await sql`
            UPDATE tenants SET stripe_connect_account_id = ${accountId} WHERE id = ${tenantId}
        `;
    }

    const origin = resolveTrustedOrigin();

    const stripe = getStripeClient();
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/settings/payments?refresh=true`,
        return_url: `${origin}/settings/payments?return=true`,
        type: 'account_onboarding',
    });

    return { url: accountLink.url };
}
