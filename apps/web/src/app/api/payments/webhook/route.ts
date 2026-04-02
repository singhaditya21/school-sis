import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { invoices, payments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';


/**
 * Stripe Webhook Handler
 *
 * Receives Stripe events and updates the database accordingly.
 * Verifies the webhook signature using STRIPE_WEBHOOK_SECRET.
 *
 * Events handled:
 *   - checkout.session.completed → Mark invoice as PAID
 *   - payment_intent.payment_failed → Log the failure
 *
 * SECURITY:
 *   - Signature verified via stripe.webhooks.constructEvent()
 *   - Raw body used for HMAC (not JSON-parsed)
 *   - Returns 200 even on processing errors to prevent Stripe retries
 */

function getStripeClient(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is required');
    return new Stripe(key, { apiVersion: '2024-06-20' });
}

function getWebhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error(
            'STRIPE_WEBHOOK_SECRET environment variable is required. ' +
            'Get it from your Stripe Dashboard → Developers → Webhooks → Signing secret.'
        );
    }
    return secret;
}

export async function POST(request: NextRequest) {
    const stripe = getStripeClient();
    const webhookSecret = getWebhookSecret();

    // Read raw body for signature verification (must be raw, not JSON-parsed)
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const invoiceId = session.metadata?.invoiceId;
                const tenantId = session.metadata?.tenantId;

                if (invoiceId) {
                    // Mark invoice as paid
                    await db.update(invoices)
                        .set({
                            status: 'PAID',
                            paidAt: new Date(),
                            paidAmount: String((session.amount_total || 0) / 100),
                            updatedAt: new Date(),
                        })
                        .where(eq(invoices.id, invoiceId));

                    // Create payment record
                    const paymentId = crypto.randomUUID();
                    await db.insert(payments).values({
                        id: paymentId,
                        invoiceId: invoiceId,
                        tenantId: tenantId || '',
                        amount: String((session.amount_total || 0) / 100),
                        method: 'STRIPE',
                        referenceNumber: session.payment_intent as string || session.id,
                        paidAt: new Date(),
                        createdAt: new Date(),
                    });

                    console.log(`[Stripe Webhook] Invoice ${invoiceId} marked as PAID (payment: ${paymentId})`);
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                console.error(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`, {
                    error: paymentIntent.last_payment_error?.message,
                });
                break;
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
    } catch (processingError: any) {
        // Return 200 even on processing errors to prevent Stripe from retrying
        console.error(`[Stripe Webhook] Processing error for ${event.type}:`, processingError.message);
    }

    return NextResponse.json({ received: true });
}
