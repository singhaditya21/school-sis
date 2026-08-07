import crypto from 'crypto';
import { pool } from '@/lib/db';
import { ROLE_GROUPS } from '@/lib/auth/api';
import { deliverWebhook } from '@/lib/actions/webhooks';
import { buildWebhookRequestHeaders } from '@/lib/integrations/webhook-security';
import {
    authenticateIntegrationRequest,
    integrationJson,
    recordIntegrationAudit,
    runWithIntegrationTenant,
} from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
    const startedAt = Date.now();
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'WEBHOOKS',
        scopes: ['webhooks:deliver'],
        allowSession: true,
        sessionRoles: ROLE_GROUPS.tenantAdmins,
    });
    if (auth.ok === false) return auth.response;

    return runWithIntegrationTenant(auth.context, async () => {

    let deliveryId: string | null = null;
    try {
        const body = await request.json();
        deliveryId = typeof body.deliveryId === 'string' ? body.deliveryId : null;
    } catch {
        deliveryId = null;
    }

    const values: unknown[] = [auth.context.tenantId];
    let deliveryFilter = `AND d.next_retry_at <= NOW()`;
    if (deliveryId) {
        values.push(deliveryId);
        deliveryFilter = `AND d.id = $${values.length}`;
    }

    const { rows } = await pool.query(
        `WITH candidates AS (
            SELECT d.id,
                   s.url,
                   s.secret,
                   s.headers,
                   s.timeout_ms AS "timeoutMs",
                   s.retry_count AS "retryCount"
            FROM webhook_deliveries d
            JOIN webhook_subscriptions s ON s.id = d.subscription_id
            WHERE d.tenant_id = $1
              AND s.tenant_id = $1
              AND d.status = 'RETRYING'
              AND d.attempts < s.retry_count + 1
              ${deliveryFilter}
            ORDER BY d.next_retry_at ASC NULLS FIRST
            FOR UPDATE OF d SKIP LOCKED
            LIMIT 25
         )
         UPDATE webhook_deliveries AS d
         SET status = 'PENDING', error = NULL
         FROM candidates AS candidate
         WHERE d.id = candidate.id
         RETURNING d.id,
                   d.event,
                   d.event_id AS "eventId",
                   d.payload,
                   d.subscription_id AS "subscriptionId",
                   candidate.url,
                   candidate.secret,
                   candidate.headers,
                   candidate."timeoutMs",
                   candidate."retryCount"`,
        values,
    );

    for (const row of rows) {
        const storedPayload = row.payload && typeof row.payload === 'object'
            ? row.payload as Record<string, unknown>
            : {};
        const body = JSON.stringify({
            event: row.event,
            eventId: row.eventId,
            payload: storedPayload.payload ?? storedPayload,
            timestamp: new Date().toISOString(),
        });
        const signature = `sha256=${crypto.createHmac('sha256', row.secret).update(body).digest('hex')}`;
        const requestHeaders = buildWebhookRequestHeaders({
            customHeaders: (row.headers || {}) as Record<string, string>,
            event: row.event,
            eventId: row.eventId,
            signature,
            idempotencyKey: `${row.event}:${row.eventId}`,
        });

        await pool.query(
            `UPDATE webhook_deliveries
             SET request_headers = $1::jsonb, signature = $2
             WHERE tenant_id = $3 AND id = $4`,
            [JSON.stringify(requestHeaders), signature, auth.context.tenantId, row.id],
        );
        await deliverWebhook(
            row.id,
            row.url,
            body,
            requestHeaders,
            row.timeoutMs || 10_000,
            Math.max(1, Number(row.retryCount) + 1),
        );
    }

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: 'WEBHOOKS',
        action: 'webhooks.delivery.retry',
        direction: 'OUTBOUND',
        status: 'QUEUED',
        request,
        context: auth.context,
        statusCode: 202,
        durationMs: Date.now() - startedAt,
        metadata: { retried: rows.length, deliveryId },
    });

    return integrationJson({ retried: rows.length, deliveries: rows.map((row) => ({ id: row.id })) }, { status: 202 });
    });
}
