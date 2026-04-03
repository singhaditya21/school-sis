import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema/core';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

export const dynamic = "force-dynamic";

// Stripe CLI testing: 
// stripe listen --forward-to localhost:3000/api/webhooks/stripe

export async function POST(req: NextRequest) {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            payload,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (err: any) {
        console.error(`⚠️  Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                
                // Retrieve the company ID injected from checkout creation
                const companyId = session.client_reference_id;
                const subscriptionId = session.subscription as string;
                const planType = session.metadata?.planType;

                if (!companyId) {
                    throw new Error('No client_reference_id found in session');
                }

                // Activate the company immediately upon successful checkout
                await db.update(companies)
                    .set({
                        stripeSubscriptionId: subscriptionId,
                        subscriptionTier: (planType || 'CORE') as any,
                        billingStatus: 'ACTIVE',
                        isActive: true // Company is fully provisioned and unlocked
                    })
                    .where(eq(companies.id, companyId));
                
                console.log(`✅ Company ${companyId} successfully provisioned and paid for tier: ${planType}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                
                const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'ACTIVE' :
                               subscription.status === 'past_due' ? 'PAST_DUE' : 
                               subscription.status === 'canceled' ? 'CANCELED' : 'UNPAID';

                // Find the company by their subscription ID
                await db.update(companies)
                    .set({
                        billingStatus: status,
                        isActive: status === 'ACTIVE', // Suspend company access if canceled or unpaid
                        stripeCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000)
                    })
                    .where(eq(companies.stripeSubscriptionId, subscription.id));

                console.log(`🔄 Subscription ${subscription.id} status updated to: ${status}`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;

                // Deactivate the company completely
                await db.update(companies)
                    .set({
                        billingStatus: 'CANCELED',
                        isActive: false
                    })
                    .where(eq(companies.stripeSubscriptionId, subscription.id));
                
                console.log(`❌ Subscription ${subscription.id} canceled. Company access revoked.`);
                break;
            }
            
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error: any) {
        console.error(`[WEBHOOK_HANDLER_ERROR]`, error.message);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
