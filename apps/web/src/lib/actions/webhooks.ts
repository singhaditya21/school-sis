'use server';

import { pool, runWithTenantContext } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import {
    ensureMockIntegrationConnection,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import { logger } from '@/lib/observability/logger';

const INTEGRATION_MODE = process.env.INTEGRATIONS_MODE === 'live' ? 'LIVE' : 'MOCK';

// ─── Webhook Management ─────────────────────────────────────

export async function registerWebhook(data: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
}) {
    const { tenantId, userId } = await requireAuth('webhooks:write');

    const secret = crypto.randomBytes(32).toString('hex');

    await ensureMockIntegrationConnection({
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
        data.url, 
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
        metadata: { subscriptionId: rows[0].id, events: data.events, mode: INTEGRATION_MODE.toLowerCase() },
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
        await ensureMockIntegrationConnection({
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
            const requestHeaders = {
                'Content-Type': 'application/json',
                'X-School-SIS-Event': event,
                'X-School-SIS-Event-Id': eventId,
                'X-School-SIS-Signature': signature,
                'Idempotency-Key': idempotencyKey,
                ...((sub.headers || {}) as Record<string, string>),
            };

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
                metadata: { deliveryId, subscriptionId: sub.id, event, eventId, idempotencyKey, mode: INTEGRATION_MODE.toLowerCase() },
            });

            deliverWebhook(deliveryId, sub.url, body, requestHeaders, sub.timeoutMs)
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

async function deliverWebhook(
    deliveryId: string,
    url: string,
    body: string,
    requestHeaders: Record<string, string>,
    timeoutMs: number,
) {
    if (INTEGRATION_MODE !== 'LIVE') {
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
            method: 'POST',
            headers: requestHeaders,
            body,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        await pool.query(`
            UPDATE webhook_deliveries
            SET status = $1,
                response_code = $2,
                response_body = $3,
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = CASE WHEN $1 = 'RETRYING' THEN NOW() + INTERVAL '5 minutes' ELSE NULL END,
                error = $4
            WHERE id = $5
        `, [
            res.ok ? 'SUCCESS' : 'RETRYING',
            res.status,
            (await res.text()).slice(0, 4000),
            res.ok ? null : `HTTP ${res.status}`,
            deliveryId,
        ]);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Webhook delivery failed';
        await pool.query(`
            UPDATE webhook_deliveries
            SET status = 'RETRYING',
                attempts = attempts + 1,
                last_attempt_at = NOW(),
                next_retry_at = NOW() + INTERVAL '5 minutes',
                error = $1
            WHERE id = $2
        `, [message, deliveryId]);
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
