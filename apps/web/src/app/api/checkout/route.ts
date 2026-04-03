import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema/core';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        // Authenticate request to ensure only logged in "unpaid" users can checkout
        // Alternatively, maybe they are just created via auth system.
        const session = await getSession();
        if (!session || !session.userId || !session.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { priceId, planType } = body;

        if (!priceId) {
            return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
        }

        // Fetch the company from the DB
        const [company] = await db.select().from(companies).where(eq(companies.id, session.companyId));
        
        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        let stripeCustomerId = company.stripeCustomerId;

        // If no stripe customer exists for this company, create one
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                name: company.name,
                metadata: {
                    companyId: company.id
                }
            });
            stripeCustomerId = customer.id;

            await db.update(companies)
                .set({ stripeCustomerId, subscriptionTier: planType as any })
                .where(eq(companies.id, company.id));
        }

        // Create the Stripe Checkout Session
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

    } catch (error: any) {
        console.error('[STRIPE_CHECKOUT_ERROR]', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
