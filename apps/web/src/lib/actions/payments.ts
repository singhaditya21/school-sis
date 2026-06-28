'use server';

import { pool } from '@/lib/db';
import { stripe } from '@/lib/stripe/server';
import { headers } from 'next/headers';

export async function createCheckoutSession(invoiceId: string) {
    const client = await pool.connect();
    
    try {
        const res = await client.query(
            'SELECT id, tenant_id, invoice_number, total_amount, paid_amount, status FROM invoices WHERE id = $1',
            [invoiceId]
        );
        
        if (res.rows.length === 0) {
            throw new Error('Invoice not found');
        }
        
        const invoice = res.rows[0];
        
        if (invoice.status === 'PAID') {
            throw new Error('Invoice is already paid');
        }

        // Get tenant's Stripe Connect Account ID
        const tenantRes = await client.query('SELECT stripe_connect_account_id FROM tenants WHERE id = $1', [invoice.tenant_id]);
        if (tenantRes.rows.length === 0 || !tenantRes.rows[0].stripe_connect_account_id) {
            throw new Error('School has not configured payment processing yet.');
        }
        const stripeAccountId = tenantRes.rows[0].stripe_connect_account_id;
        
        
        const amountDue = parseFloat(invoice.total_amount) - parseFloat(invoice.paid_amount);
        const amountInCents = Math.round(amountDue * 100);
        
        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: `Invoice #${invoice.invoice_number}`,
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/my-fees?success=true&invoiceId=${invoiceId}`,
            cancel_url: `${origin}/my-fees?canceled=true`,
            metadata: {
                invoiceId: invoice.id,
            },
        }, { stripeAccount: stripeAccountId });
        
        if (!session.url) {
            throw new Error('Failed to create Stripe session');
        }
        
        return { url: session.url };
        
    } finally {
        client.release();
    }
}

export async function createStripeConnectAccount() {
    const { requireAuth } = await import('@/lib/auth/middleware');
    const { tenantId } = await requireAuth();
    
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT stripe_connect_account_id FROM tenants WHERE id = $1', [tenantId]);
        let accountId = res.rows[0]?.stripe_connect_account_id;

        if (!accountId) {
            const account = await stripe.accounts.create({ type: 'standard' });
            accountId = account.id;
            await client.query('UPDATE tenants SET stripe_connect_account_id = $1 WHERE id = $2', [accountId, tenantId]);
        }

        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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
