import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { pool, runWithTenantContext } from '@/lib/db';

export const dynamic = "force-dynamic";

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
    return new Stripe(key, { apiVersion: '2026-02-25.clover' });
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

                if (invoiceId && tenantId) {
                    const paymentId = crypto.randomUUID();
                    await runWithTenantContext(tenantId, async () => {
                        // Mark invoice as paid
                        await pool.query(
                            `UPDATE invoices SET status = $1, paid_at = $2, paid_amount = $3, updated_at = $4 WHERE id = $5 AND tenant_id = $6`,
                            ['PAID', new Date(), String((session.amount_total || 0) / 100), new Date(), invoiceId, tenantId]
                        );

                        // Create payment record
                        await pool.query(
                            `INSERT INTO payments (id, invoice_id, tenant_id, amount, method, reference_number, paid_at, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [
                                paymentId,
                                invoiceId,
                                tenantId,
                                String((session.amount_total || 0) / 100),
                                'STRIPE',
                                (session.payment_intent as string) || session.id,
                                new Date(),
                                new Date(),
                            ]
                        );
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
