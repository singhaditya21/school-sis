import { NextRequest, NextResponse } from 'next/server';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { isMetaCloudProvider } from '@/lib/providers/whatsapp';
import { recordDeliveryReceipt } from '@/lib/notifications/outbox';
import {
    parseWhatsAppReceipts,
    verifyWhatsAppHandshake,
    verifyWhatsAppSignature,
} from '@/lib/notifications/receipts';
import { logger } from '@/lib/observability/logger';

// The provider signs the raw body, so the body must never be cached or reparsed
// before verification, and the route must run on Node (crypto + raw text).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Meta WhatsApp Cloud API status webhook. Configure in the Meta app dashboard:
//   Callback URL:  https://<host>/api/webhooks/whatsapp
//   Verify token:  WHATSAPP_WEBHOOK_VERIFY_TOKEN   (GET handshake)
//   App secret:    WHATSAPP_APP_SECRET             (X-Hub-Signature-256)
// Ships inert: with either secret unset, the handshake and every POST fail closed.

/**
 * Subscription handshake. Meta calls this once with hub.mode=subscribe, the
 * configured verify token, and a challenge to echo back verbatim.
 */
export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const challenge = verifyWhatsAppHandshake(
        {
            mode: params.get('hub.mode'),
            token: params.get('hub.verify_token'),
            challenge: params.get('hub.challenge'),
        },
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    );

    if (challenge === null) {
        return new NextResponse('Forbidden', { status: 403 });
    }
    return new NextResponse(challenge, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
    });
}

/**
 * Delivery-status callbacks. Verifies the signature fail-closed, then applies each
 * terminal receipt to its outbox row. Returns 200 with a count so Meta stops
 * retrying; an unknown message id is not an error (the row may have been pruned).
 */
export async function POST(req: NextRequest) {
    const raw = await req.text();

    if (!verifyWhatsAppSignature(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
        // Fail-closed: unset secret, missing header, or bad signature.
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Match the outbox row's provider exactly (rows store WHATSAPP_PROVIDER's value,
    // e.g. "meta_cloud"), and refuse Meta-format payloads if WhatsApp is not on a
    // Meta Cloud provider on this deployment.
    const provider = notificationProviderForChannel('WHATSAPP');
    if (!isMetaCloudProvider(provider)) {
        return NextResponse.json({ error: 'WhatsApp is not on a Meta Cloud provider' }, { status: 400 });
    }

    let body: unknown;
    try {
        body = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const receipts = parseWhatsAppReceipts(body);
    let matched = 0;

    for (const receipt of receipts) {
        try {
            const result = await recordDeliveryReceipt({
                provider,
                providerMessageId: receipt.providerMessageId,
                status: receipt.status,
                error: receipt.error,
            });
            if (result.matched) matched += 1;
        } catch (error) {
            // One bad row must not fail the batch — Meta would replay the whole
            // payload, re-applying receipts already recorded.
            logger.error('notification.receipt_record_failed', 'Failed to record WhatsApp delivery receipt', {
                source: 'notifications',
                metadata: {
                    provider,
                    providerMessageId: receipt.providerMessageId,
                    error: error instanceof Error ? error.message : String(error),
                },
            });
        }
    }

    return NextResponse.json({ received: receipts.length, matched });
}
