import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { getStripeClient } from '@/lib/payments/providers';
import { z } from 'zod';

export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
    priceId: z.string().min(1),
    planType: z.enum(['CORE', 'AI_PRO', 'ENTERPRISE']).default('CORE'),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
        if (auth.ok === false) return auth.response;

        const session = await getSession();
        if (!session.companyId) {
            return NextResponse.json({ error: 'Company context is required' }, { status: 400 });
        }

        const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = CheckoutSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid checkout request' }, { status: 400 });
        }
        const { priceId, planType } = parsed.data;

        // Fetch the company from the DB
        const { rows: [company] } = await pool.query(
            `SELECT *, stripe_customer_id AS "stripeCustomerId" FROM companies WHERE id = $1`,
            [session.companyId]
        );
        
        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        let stripeCustomerId = company.stripeCustomerId;

        // If no stripe customer exists for this company, create one
        if (!stripeCustomerId) {
            const stripe = getStripeClient();
            const customer = await stripe.customers.create({
                name: company.name,
                metadata: {
                    companyId: company.id
                }
            });
            stripeCustomerId = customer.id;

            await pool.query(
                `UPDATE companies SET stripe_customer_id = $1, subscription_tier = $2 WHERE id = $3`,
                [stripeCustomerId, planType, company.id]
            );
        }

        // Create the Stripe Checkout Session
        const stripe = getStripeClient();
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            // Use metadata to safely pass the companyId onto the webhook
            metadata: {
                companyId: company.id,
                planType: planType
            },
            client_reference_id: company.id,
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/setup/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
        });

        return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });

    } catch (error) {
        console.error('[STRIPE_CHECKOUT_ERROR]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
