'use server';

import { sql } from '@/lib/db';
import { recordIntegrationAudit } from '@/lib/integrations/api-platform';
import { mockWebhookDeliveryIsEnabled } from '@/lib/integrations/runtime-mode';
import { sendWebhookRequest } from '@/lib/integrations/webhook-security';

export async function deliverWebhook(
    deliveryId: string,
    url: string,
    body: string,
    requestHeaders: Record<string, string>,
    timeoutMs: number,
    maxAttempts = 4,
) {
    if (mockWebhookDeliveryIsEnabled()) {
        const mockBody = JSON.stringify({ mocked: true, targetUrl: url, accepted: true });
        const delivery = await sql<{
            tenantId: string;
            event: string;
            eventId: string;
            subscriptionId: string;
        }>`
            UPDATE webhook_deliveries
            SET status = 'SUCCESS',
                response_code = 202,
                response_body = ${mockBody},
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = NULL,
                error = NULL
            WHERE id = ${deliveryId}
            RETURNING tenant_id AS "tenantId", event, event_id AS "eventId", subscription_id AS "subscriptionId"
        `.maybeOne();

        if (delivery) {
            await recordIntegrationAudit({
                tenantId: delivery.tenantId,
                provider: 'WEBHOOKS',
                action: 'webhooks.delivery.mocked',
                direction: 'OUTBOUND',
                status: 'SUCCESS',
                statusCode: 202,
                metadata: {
                    deliveryId,
                    subscriptionId: delivery.subscriptionId,
                    event: delivery.event,
                    eventId: delivery.eventId,
                    targetUrl: url,
                    mode: 'mock',
                },
            });
        }
        return;
    }

    try {
        const res = await sendWebhookRequest(url, body, requestHeaders, timeoutMs);
        const isOk = res.ok;
        const truncatedBody = res.body.slice(0, 4000);
        const errorText = isOk ? null : `HTTP ${res.status}`;
        await sql`
            UPDATE webhook_deliveries AS deliveries
            SET status = CASE
                    WHEN ${isOk}::boolean THEN 'SUCCESS'::delivery_status
                    WHEN deliveries.attempts + 1 >= ${maxAttempts}::integer THEN 'FAILED'::delivery_status
                    ELSE 'RETRYING'::delivery_status
                END,
                response_code = ${res.status},
                response_body = ${truncatedBody},
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = CASE
                    WHEN NOT ${isOk}::boolean AND deliveries.attempts + 1 < ${maxAttempts}::integer
                        THEN NOW() + INTERVAL '5 minutes'
                    ELSE NULL
                END,
                error = CASE WHEN ${isOk}::boolean THEN NULL ELSE ${errorText} END
            WHERE id = ${deliveryId}
        `.execute();
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Webhook delivery failed';
        await sql`
            UPDATE webhook_deliveries AS deliveries
            SET status = CASE
                    WHEN deliveries.attempts + 1 >= ${maxAttempts}::integer THEN 'FAILED'::delivery_status
                    ELSE 'RETRYING'::delivery_status
                END,
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = CASE
                    WHEN deliveries.attempts + 1 < ${maxAttempts}::integer THEN NOW() + INTERVAL '5 minutes'
                    ELSE NULL
                END,
                error = ${message}
            WHERE id = ${deliveryId}
        `.execute();
    }
}
