import { NextRequest, NextResponse } from 'next/server';
import { getStripeGateway } from '@/lib/payments/providers';
import { handleStripeWebhookEvent } from '@/lib/payments/stripe-webhooks';

export const dynamic = 'force-dynamic';

// Stripe CLI testing:
// stripe listen --forward-to localhost:3000/api/webhooks/stripe

export async function POST(req: NextRequest) {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    try {
        const event = getStripeGateway().constructWebhookEvent(payload, signature);
        const result = await handleStripeWebhookEvent(event);
        return NextResponse.json({ received: true, duplicate: result.duplicate });
    } catch (error) {
        console.error('[Stripe Webhook] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
    }
}
