'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

// ─── Webhook Management ─────────────────────────────────────

export async function registerWebhook(data: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
}) {
    const { tenantId } = await requireAuth('webhooks:write');

    const secret = crypto.randomBytes(32).toString('hex');

    await pool.query(`
        INSERT INTO webhook_subscriptions (id, tenant_id, name, url, secret, events, headers)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        randomUUID(), 
        tenantId, 
        data.name, 
        data.url, 
        secret, 
        data.events, 
        data.headers ? JSON.stringify(data.headers) : null 
    ]);

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
    const { tenantId } = await requireAuth('webhooks:write');

    await pool.query(`
        DELETE FROM webhook_subscriptions
        WHERE id = $1 AND tenant_id = $2
    `, [webhookId, tenantId]);

    return { success: true };
}

// ─── Event Dispatcher ────────────────────────────────────────

export async function dispatchEvent(tenantId: string, event: string, payload: Record<string, unknown>) {
    // Find all active subscriptions matching this event
    const { rows: subs } = await pool.query(`
        SELECT id, events, url, secret, headers, retry_count AS "retryCount", timeout_ms AS "timeoutMs"
        FROM webhook_subscriptions
        WHERE tenant_id = $1 AND status = 'ACTIVE'
    `, [tenantId]);

    // Filter subscriptions by event match
    const matchingSubs = subs.filter(sub => {
        const events = sub.events as string[];
        return events.includes(event) || events.includes('*');
    });

    // Fire-and-forget delivery for each subscription
    for (const sub of matchingSubs) {
        const deliveryId = randomUUID();
        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');

        // Log delivery attempt
        await pool.query(`
            INSERT INTO webhook_deliveries (id, subscription_id, event, payload, status)
            VALUES ($1, $2, $3, $4, $5)
        `, [deliveryId, sub.id, event, JSON.stringify({ event, payload }), 'PENDING']);

        // Deliver asynchronously (fire-and-forget)
        deliverWebhook(deliveryId, sub.url, body, signature, sub.headers as Record<string, string> | null, sub.timeoutMs)
            .catch(err => console.error({ event: 'webhook.delivery_failed', deliveryId, error: err.message }));
    }

    return { dispatched: matchingSubs.length };
}

async function deliverWebhook(
    deliveryId: string,
    url: string,
    body: string,
    signature: string,
    customHeaders: Record<string, string> | null,
    timeoutMs: number,
) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': 'event',
                ...(customHeaders || {}),
            },
            body,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        await pool.query(`
            UPDATE webhook_deliveries
            SET status = $1, response_code = $2, attempts = 1, last_attempt_at = NOW(), error = $3
            WHERE id = $4
        `, [res.ok ? 'SUCCESS' : 'FAILED', res.status, res.ok ? null : `HTTP ${res.status}`, deliveryId]);
    } catch (err: any) {
        await pool.query(`
            UPDATE webhook_deliveries
            SET status = 'FAILED', attempts = 1, last_attempt_at = NOW(), error = $1
            WHERE id = $2
        `, [err.message, deliveryId]);
    }
}

// ─── Delivery Logs ───────────────────────────────────────────

export async function getWebhookDeliveries(webhookId: string) {
    await requireAuth('webhooks:read');

    const { rows } = await pool.query(`
        SELECT id, event, status, response_code AS "responseCode", attempts, error, created_at AS "createdAt"
        FROM webhook_deliveries
        WHERE subscription_id = $1
        ORDER BY created_at DESC
        LIMIT 50
    `, [webhookId]);

    return rows;
}
