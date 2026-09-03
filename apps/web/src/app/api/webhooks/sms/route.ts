import { NextRequest, NextResponse } from 'next/server';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { recordDeliveryReceipt } from '@/lib/notifications/outbox';
import {
    parseMsg91Receipts,
    parseTwilioReceipt,
    verifyMsg91Secret,
    verifyTwilioSignature,
} from '@/lib/notifications/sms-receipts';
import { logger } from '@/lib/observability/logger';

// The provider signs (Twilio) or shared-secrets (MSG91) the raw body, so it must be
// read as text and verified before use. Node runtime for crypto.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SMS delivery-status webhook. Configure the provider's status/DLR callback to:
//   https://<host>/api/webhooks/sms
//   Twilio: verified by X-Twilio-Signature (TWILIO_AUTH_TOKEN). Behind a proxy set
//           TWILIO_STATUS_CALLBACK_URL to the exact public URL Twilio calls.
//   MSG91 : append the shared secret and set MSG91_WEBHOOK_SECRET (MSG91 sends no
//           signature). The report shape must be confirmed against a live payload.
// Ships inert: with the relevant secret unset, every POST fails closed.

function callbackUrl(req: NextRequest): string {
    const override = process.env.TWILIO_STATUS_CALLBACK_URL;
    if (override) return override;
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
    return `${proto}://${host}${req.nextUrl.pathname}`;
}

export async function POST(req: NextRequest) {
    const provider = notificationProviderForChannel('SMS');
    const raw = await req.text();

    if (provider === 'twilio') {
        const params = Object.fromEntries(new URLSearchParams(raw));
        if (!verifyTwilioSignature(callbackUrl(req), params, req.headers.get('x-twilio-signature'), process.env.TWILIO_AUTH_TOKEN)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        const receipt = parseTwilioReceipt(params);
        const matched = receipt ? await applyReceipt('twilio', receipt) : 0;
        return NextResponse.json({ received: receipt ? 1 : 0, matched });
    }

    if (provider === 'msg91') {
        const secret = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
        if (!verifyMsg91Secret(secret, process.env.MSG91_WEBHOOK_SECRET)) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }
        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }
        const receipts = parseMsg91Receipts(body);
        let matched = 0;
        for (const receipt of receipts) matched += await applyReceipt('msg91', receipt);
        return NextResponse.json({ received: receipts.length, matched });
    }

    return NextResponse.json({ error: 'SMS is not on a receipt-capable provider' }, { status: 400 });
}

async function applyReceipt(
    provider: string,
    receipt: { providerMessageId: string; status: 'DELIVERED' | 'FAILED'; error?: string },
): Promise<number> {
    try {
        const result = await recordDeliveryReceipt({ provider, ...receipt });
        return result.matched ? 1 : 0;
    } catch (error) {
        logger.error('notification.receipt_record_failed', 'Failed to record SMS delivery receipt', {
            source: 'notifications',
            metadata: {
                provider,
                providerMessageId: receipt.providerMessageId,
                error: error instanceof Error ? error.message : String(error),
            },
        });
        return 0;
    }
}
