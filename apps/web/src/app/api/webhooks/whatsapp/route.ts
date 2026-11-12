import { NextRequest, NextResponse } from 'next/server';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { getWhatsAppProvider, isMetaCloudProvider } from '@/lib/providers/whatsapp';
import { recordDeliveryReceipt } from '@/lib/notifications/outbox';
import {
    parseWhatsAppReceipts,
    verifyWhatsAppHandshake,
    verifyWhatsAppSignature,
} from '@/lib/notifications/receipts';
import {
    locateGuardianTenantByPhone,
    parseInboundWhatsAppMessages,
    resolveConciergeReplyForTenant,
} from '@/lib/concierge/whatsapp-concierge';
import { logger } from '@/lib/observability/logger';

// The provider signs the raw body, so the body must never be cached or reparsed
// before verification, and the route must run on Node (crypto + raw text).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
 * Delivery-status callbacks AND 2-Way Verified Guardian Concierge replies.
 * Verifies the signature fail-closed, records delivery statuses, and answers
 * inbound guardian menu commands within the Meta 24-hour customer-service window.
 */
export async function POST(req: NextRequest) {
    const raw = await req.text();

    if (!verifyWhatsAppSignature(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

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

    const inboundMessages = parseInboundWhatsAppMessages(body);
    if (inboundMessages.length === 0) {
        return NextResponse.json({ received: receipts.length, matched });
    }

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    let conciergeReplied = 0;

    for (const inbound of inboundMessages) {
        try {
            const located = await locateGuardianTenantByPhone(inbound.fromDigits);
            if (!located) continue;

            const reply = await resolveConciergeReplyForTenant({
                tenantId: located.tenantId,
                fromPhone: inbound.fromDigits,
                rawText: inbound.text,
                appOrigin,
            });
            if (!reply || !reply.ok) continue;

            const dispatch = await getWhatsAppProvider().send({
                to: inbound.fromDigits,
                body: reply.replyText,
                payload: { whatsapp: { messageType: 'text' } },
            });
            if (dispatch.success) {
                conciergeReplied += 1;
            }
        } catch (error) {
            logger.error('concierge.whatsapp_reply_failed', 'Failed to answer inbound WhatsApp concierge message', {
                source: 'concierge',
                metadata: {
                    messageId: inbound.messageId,
                    error: error instanceof Error ? error.message : String(error),
                },
            });
        }
    }

    return NextResponse.json({
        received: receipts.length,
        matched,
        inboundMessages: inboundMessages.length,
        conciergeReplied,
    });
}
