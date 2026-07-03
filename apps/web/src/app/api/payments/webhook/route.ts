import { NextRequest, NextResponse } from 'next/server';
import { getStripeGateway, verifyRazorpayWebhookSignature } from '@/lib/payments/providers';
import { handleRazorpayWebhookPayload } from '@/lib/payments/razorpay-webhooks';
import { handleStripeWebhookEvent } from '@/lib/payments/stripe-webhooks';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const stripeSignature = request.headers.get('stripe-signature');
    const razorpaySignature = request.headers.get('x-razorpay-signature');

    if (!stripeSignature && !razorpaySignature) {
        return NextResponse.json({ error: 'Missing payment provider signature' }, { status: 400 });
    }

    try {
        if (stripeSignature) {
            const event = getStripeGateway().constructWebhookEvent(rawBody, stripeSignature);
            const result = await handleStripeWebhookEvent(event);
            return NextResponse.json({ received: true, provider: 'STRIPE', duplicate: result.duplicate });
        }

        if (!verifyRazorpayWebhookSignature(rawBody, razorpaySignature || '')) {
            return NextResponse.json({ error: 'Invalid Razorpay signature' }, { status: 403 });
        }

        const payload = JSON.parse(rawBody);
        const result = await handleRazorpayWebhookPayload(payload);
        return NextResponse.json({ received: true, provider: 'RAZORPAY', duplicate: result.duplicate });
    } catch (error) {
        logger.error('payment.webhook_failed', 'Payment webhook handler failed', {
            source: 'payments',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
    }
}
