import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { claimSingleUseToken } from '@/lib/auth/rate-limit';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
    getWhatsAppProvider,
    isMetaCloudProvider,
    isSelfHostedWhatsAppProvider,
} from '@/lib/providers/whatsapp';
import { recordDeliveryReceipt } from '@/lib/notifications/outbox';
import {
    parseWhatsAppReceipts,
    verifyWhatsAppHandshake,
    verifyWhatsAppSignature,
} from '@/lib/notifications/receipts';
import {
    parseInboundWhatsAppMessages,
    processInboundConciergeMessage,
    resolveInboundWhatsAppTenant,
} from '@/lib/concierge/whatsapp-concierge';
import { resolveTrustedAppOrigin } from '@/lib/security/client-ip';
import { isDemoTenantId } from '@/lib/tenant/demo-guard';
import { logger } from '@/lib/observability/logger';

// The provider signs the raw body, so the body must never be cached or reparsed
// before verification, and the route must run on Node (crypto + raw text).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function verifySelfHostedWebhookAuth(
    rawBody: string,
    req: NextRequest,
    secret: string | undefined,
    provider: string,
): boolean {
    if (!secret || secret.trim().length < 16) return false;
    const cleanSecret = secret.trim();

    // 1. WAHA / Meta-compatible HMAC-SHA256 (`X-Webhook-Hmac`, `X-Webhook-Hmac-Sha256`, or `X-Hub-Signature-256`)
    const hubSig = req.headers.get('x-hub-signature-256');
    if (hubSig && verifyWhatsAppSignature(rawBody, hubSig, cleanSecret)) {
        return true;
    }

    const wahaHmac = req.headers.get('x-webhook-hmac') || req.headers.get('x-webhook-hmac-sha256');
    if (wahaHmac) {
        const computedHex = crypto.createHmac('sha256', cleanSecret).update(rawBody, 'utf8').digest('hex');
        const normalizedProvided = wahaHmac.trim().replace(/^sha256=/i, '');
        const a = Buffer.from(normalizedProvided);
        const b = Buffer.from(computedHex);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return true;
        }
    }

    // When `WHATSAPP_PROVIDER=waha`, strictly require valid HMAC-SHA256 (never downgrade to static header)
    if (provider === 'waha') {
        return false;
    }

    // 2. Evolution API shared webhook secret header (`X-Webhook-Secret` or `apikey`)
    const sharedHeader = req.headers.get('x-webhook-secret') || req.headers.get('apikey');
    if (sharedHeader) {
        const a = Buffer.from(sharedHeader.trim());
        const b = Buffer.from(cleanSecret);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return true;
        }
    }

    return false;
}

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
 * Supports both official Meta Cloud API (`WHATSAPP_PROVIDER=meta_cloud`) and
 * zero-cost open-source self-hosted gateways (`WHATSAPP_PROVIDER=waha` / `evolution`).
 */
export async function POST(req: NextRequest) {
    const raw = await req.text();
    const provider = notificationProviderForChannel('WHATSAPP');
    const selfHosted = isSelfHostedWhatsAppProvider(provider);

    if (selfHosted) {
        const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
        if (!verifySelfHostedWebhookAuth(raw, req, webhookSecret, provider)) {
            return NextResponse.json({ error: 'Invalid webhook signature or secret' }, { status: 401 });
        }
    } else {
        if (!verifyWhatsAppSignature(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        if (!isMetaCloudProvider(provider)) {
            return NextResponse.json(
                { error: 'WhatsApp provider is not configured for inbound webhooks' },
                { status: 400 },
            );
        }
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

    const appOrigin = resolveTrustedAppOrigin(req.nextUrl.origin);
    const hintTenantId = req.nextUrl.searchParams.get('tenantId') || req.headers.get('x-tenant-id');
    let conciergeReplied = 0;

    for (const inbound of inboundMessages) {
        try {
            const freshMessage = await claimSingleUseToken(inbound.messageId, 'whatsapp-inbound-msg');
            if (!freshMessage) {
                continue;
            }

            const routing = await resolveInboundWhatsAppTenant({
                phoneNumberId: inbound.phoneNumberId,
                hintTenantId,
                fromDigits: inbound.fromDigits,
                rawText: inbound.text,
            });

            if (routing.status === 'NOT_FOUND') {
                continue;
            }

            if (routing.status === 'AMBIGUOUS') {
                const disambiguationDispatch = await getWhatsAppProvider().send({
                    to: inbound.fromDigits,
                    body: routing.replyText,
                    payload: { whatsapp: { messageType: 'text' } },
                });
                if (disambiguationDispatch.success) {
                    conciergeReplied += 1;
                }
                continue;
            }

            if (await isDemoTenantId(routing.tenantId)) {
                continue;
            }

            const reply = await processInboundConciergeMessage({
                tenantId: routing.tenantId,
                fromPhone: inbound.fromDigits,
                rawText: routing.normalizedText,
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
