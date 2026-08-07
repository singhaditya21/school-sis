'use server';

import { pool, runWithTenantContext } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import {
    ensureIntegrationConnection,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import {
    integrationRuntimeMode,
    mockWebhookDeliveryIsEnabled,
} from '@/lib/integrations/runtime-mode';
import {
    assertWebhookCustomHeadersAllowed,
    buildWebhookRequestHeaders,
    sendWebhookRequest,
    validateWebhookTargetUrl,
} from '@/lib/integrations/webhook-security';
import { logger } from '@/lib/observability/logger';

// ─── Webhook Management ─────────────────────────────────────

export async function registerWebhook(data: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
}) {
    const { tenantId, userId } = await requireAuth('webhooks:write');
    const targetUrl = await validateWebhookTargetUrl(data.url);
    assertWebhookCustomHeadersAllowed(data.headers);

    const secret = crypto.randomBytes(32).toString('hex');

    await ensureIntegrationConnection({
        tenantId,
        provider: 'WEBHOOKS',
        scopes: ['webhooks:manage', 'webhooks:deliver'],
        userId,
    });

    const { rows } = await pool.query(`
        INSERT INTO webhook_subscriptions (id, tenant_id, name, url, secret, events, headers)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `, [
        randomUUID(), 
        tenantId, 
        data.name, 
        targetUrl.toString(),
        secret, 
        data.events, 
        data.headers ? JSON.stringify(data.headers) : null 
    ]);

    await recordIntegrationAudit({
        tenantId,
        provider: 'WEBHOOKS',
        action: 'webhooks.subscription.create',
        direction: 'INTERNAL',
        status: 'SUCCESS',
        context: { tenantId, userId, provider: 'WEBHOOKS', subjectType: 'session', scopes: ['session'] },
        metadata: { subscriptionId: rows[0].id, events: data.events, mode: integrationRuntimeMode().toLowerCase() },
    });

    return { success: true, secret };
}

export async function listWebhooks() {
    const { tenantId } = await requireAuth('webhooks:read');

    const { rows } = await pool.query(`
        SELECT id, name, url, events, status, created_at AS "createdAt"
        FROM webhook_subscriptions
        WHERE tenant_id = $1
        ORDER BY created_at DESC
    `, [tenantId]);

    return rows;
}

export async function deleteWebhook(webhookId: string) {
    const { tenantId, userId } = await requireAuth('webhooks:write');

    await pool.query(`
        DELETE FROM webhook_subscriptions
        WHERE id = $1 AND tenant_id = $2
    `, [webhookId, tenantId]);

    await recordIntegrationAudit({
        tenantId,
        provider: 'WEBHOOKS',
        action: 'webhooks.subscription.delete',
        direction: 'INTERNAL',
        status: 'SUCCESS',
        context: { tenantId, userId, provider: 'WEBHOOKS', subjectType: 'session', scopes: ['session'] },
        metadata: { subscriptionId: webhookId },
    });

    return { success: true };
}

// ─── Event Dispatcher ────────────────────────────────────────

export async function dispatchEvent(tenantId: string, event: string, payload: Record<string, unknown>) {
    return runWithTenantContext(tenantId, async () => {
        await ensureIntegrationConnection({
            tenantId,
            provider: 'WEBHOOKS',
            scopes: ['webhooks:manage', 'webhooks:deliver'],
        });

        const { rows: subs } = await pool.query(`
            SELECT id, events, url, secret, headers, retry_count AS "retryCount", timeout_ms AS "timeoutMs"
            FROM webhook_subscriptions
            WHERE tenant_id = $1 AND status = 'ACTIVE'
        `, [tenantId]);

        const matchingSubs = subs.filter(sub => {
            const events = sub.events as string[];
            return events.includes(event) || events.includes('*');
        });

        for (const sub of matchingSubs) {
            const deliveryId = randomUUID();
            const eventId = randomUUID();
            const idempotencyKey = `${event}:${eventId}`;
            const body = JSON.stringify({ event, eventId, payload, timestamp: new Date().toISOString() });
            const signature = `sha256=${crypto.createHmac('sha256', sub.secret).update(body).digest('hex')}`;
            const requestHeaders = buildWebhookRequestHeaders({
                customHeaders: (sub.headers || {}) as Record<string, string>,
                event,
                eventId,
                signature,
                idempotencyKey,
            });

            await pool.query(`
                INSERT INTO webhook_deliveries (
                    id, tenant_id, subscription_id, event, event_id, idempotency_key,
                    payload, request_headers, signature, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'PENDING')
                ON CONFLICT (subscription_id, idempotency_key) DO NOTHING
            `, [
                deliveryId,
                tenantId,
                sub.id,
                event,
                eventId,
                idempotencyKey,
                JSON.stringify({ event, eventId, payload }),
                JSON.stringify(requestHeaders),
                signature,
            ]);

            await recordIntegrationAudit({
                tenantId,
                provider: 'WEBHOOKS',
                action: 'webhooks.delivery.queued',
                direction: 'OUTBOUND',
                status: 'QUEUED',
                metadata: { deliveryId, subscriptionId: sub.id, event, eventId, idempotencyKey, mode: integrationRuntimeMode().toLowerCase() },
            });

            await deliverWebhook(
                deliveryId,
                sub.url,
                body,
                requestHeaders,
                sub.timeoutMs,
                Math.max(1, Number(sub.retryCount) + 1),
            )
                .catch((err) => logger.error('webhook.delivery_failed', 'Webhook delivery failed', {
                    tenantId,
                    source: 'webhooks',
                    entityType: 'webhook_delivery',
                    entityId: deliveryId,
                    metadata: { error: err instanceof Error ? err.message : String(err) },
                }));
        }

        return { dispatched: matchingSubs.length };
    });
}

export async function deliverWebhook(
    deliveryId: string,
    url: string,
    body: string,
    requestHeaders: Record<string, string>,
    timeoutMs: number,
    maxAttempts = 4,
) {
    if (mockWebhookDeliveryIsEnabled()) {
        const { rows } = await pool.query(`
            UPDATE webhook_deliveries
            SET status = 'SUCCESS',
                response_code = 202,
                response_body = $1,
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = NULL,
                error = NULL
            WHERE id = $2
            RETURNING tenant_id AS "tenantId", event, event_id AS "eventId", subscription_id AS "subscriptionId"
        `, [JSON.stringify({ mocked: true, targetUrl: url, accepted: true }), deliveryId]);
        const delivery = rows[0];
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
        await pool.query(`
            UPDATE webhook_deliveries AS deliveries
            SET status = CASE
                    WHEN $1::boolean THEN 'SUCCESS'::delivery_status
                    WHEN deliveries.attempts + 1 >= $2::integer THEN 'FAILED'::delivery_status
                    ELSE 'RETRYING'::delivery_status
                END,
                response_code = $3,
                response_body = $4,
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = CASE
                    WHEN NOT $1::boolean AND deliveries.attempts + 1 < $2::integer
                        THEN NOW() + INTERVAL '5 minutes'
                    ELSE NULL
                END,
                error = CASE WHEN $1::boolean THEN NULL ELSE $5 END
            WHERE id = $6
        `, [
            res.ok,
            maxAttempts,
            res.status,
            res.body.slice(0, 4000),
            res.ok ? null : `HTTP ${res.status}`,
            deliveryId,
        ]);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Webhook delivery failed';
        await pool.query(`
            UPDATE webhook_deliveries AS deliveries
            SET status = CASE
                    WHEN deliveries.attempts + 1 >= $1::integer THEN 'FAILED'::delivery_status
                    ELSE 'RETRYING'::delivery_status
                END,
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = CASE
                    WHEN deliveries.attempts + 1 < $1::integer THEN NOW() + INTERVAL '5 minutes'
                    ELSE NULL
                END,
                error = $2
            WHERE id = $3
        `, [maxAttempts, message, deliveryId]);
    }
}

// ─── Delivery Logs ───────────────────────────────────────────

export async function getWebhookDeliveries(webhookId: string) {
    const { tenantId } = await requireAuth('webhooks:read');

    const { rows } = await pool.query(`
        SELECT d.id,
               d.event,
               d.event_id AS "eventId",
               d.idempotency_key AS "idempotencyKey",
               d.status,
               d.response_code AS "responseCode",
               d.attempts,
               d.error,
               d.created_at AS "createdAt"
        FROM webhook_deliveries d
        JOIN webhook_subscriptions s ON s.id = d.subscription_id
        WHERE d.subscription_id = $1
          AND d.tenant_id = $2
          AND s.tenant_id = $2
        ORDER BY d.created_at DESC
        LIMIT 50
    `, [webhookId, tenantId]);

    return rows;
}
