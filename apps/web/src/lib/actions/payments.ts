'use server';

import { pool } from '@/lib/db';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/auth/middleware';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    outstandingMinor,
} from '@/lib/payments/ledger';
import { getStripeClient } from '@/lib/payments/providers';

export async function createCheckoutSession(invoiceId: string) {
    const { tenantId, userId, session: authSession } = await requireAuth();
    const client = await pool.connect();
    
    try {
        const invoice = await findInvoiceForPayment(
            invoiceId,
            tenantId,
            userId,
            authSession.role,
        );

        if (!invoice) {
            throw new Error('Invoice not found');
        }

        if (invoice.status === 'PAID') {
            throw new Error('Invoice is already paid');
        }

        // Get tenant's Stripe Connect Account ID
        const tenantRes = await client.query('SELECT stripe_connect_account_id FROM tenants WHERE id = $1', [tenantId]);
        if (tenantRes.rows.length === 0 || !tenantRes.rows[0].stripe_connect_account_id) {
            throw new Error('School has not configured payment processing yet.');
        }
        const stripeAccountId = tenantRes.rows[0].stripe_connect_account_id;
        const amountInCents = outstandingMinor(invoice);
        if (amountInCents <= 0) {
            throw new Error('Invoice has no outstanding balance.');
        }
        
        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const stripe = getStripeClient();
        const existingOrder = await getPaymentOrderByIdempotency(tenantId, 'STRIPE', invoice.id, amountInCents, 'INR');
        if (existingOrder?.providerOrderId) {
            const existingSession = await stripe.checkout.sessions.retrieve(
                existingOrder.providerOrderId,
                {},
                { stripeAccount: stripeAccountId },
            );
            if (existingSession.url) {
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
                        unit_amount: amountInCents,
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
            amountMinor: checkoutSession.amount_total || amountInCents,
            currency: (checkoutSession.currency || 'INR').toUpperCase(),
            providerOrderId: checkoutSession.id,
            createdBy: userId,
            metadata: {
                stripeConnectAccountId: stripeAccountId,
                checkoutUrl: checkoutSession.url,
                source: 'parent_server_action',
            },
        });
        
        return { url: checkoutSession.url };
        
    } finally {
        client.release();
    }
}

export async function createStripeConnectAccount() {
    const { tenantId } = await requireAuth();
    
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT stripe_connect_account_id FROM tenants WHERE id = $1', [tenantId]);
        let accountId = res.rows[0]?.stripe_connect_account_id;

        if (!accountId) {
            const stripe = getStripeClient();
            const account = await stripe.accounts.create({ type: 'standard' });
            accountId = account.id;
            await client.query('UPDATE tenants SET stripe_connect_account_id = $1 WHERE id = $2', [accountId, tenantId]);
        }

        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        const stripe = getStripeClient();
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${origin}/settings/payments?refresh=true`,
            return_url: `${origin}/settings/payments?return=true`,
            type: 'account_onboarding',
        });

        return { url: accountLink.url };
    } finally {
        client.release();
    }
}
