import { pool } from '@/lib/db';
import { ROLE_GROUPS } from '@/lib/auth/api';
import {
    authenticateIntegrationRequest,
    integrationJson,
    recordIntegrationAudit,
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
        `UPDATE webhook_deliveries d
         SET status = 'SUCCESS',
             response_code = 202,
             response_body = jsonb_build_object('mocked', true, 'retried', true)::text,
             attempts = attempts + 1,
             last_attempt_at = NOW(),
             next_retry_at = NULL,
             error = NULL
         FROM webhook_subscriptions s
         WHERE s.id = d.subscription_id
           AND d.tenant_id = $1
           AND s.tenant_id = $1
           AND d.status = 'RETRYING'
           ${deliveryFilter}
         RETURNING d.id, d.event, d.event_id AS "eventId", d.subscription_id AS "subscriptionId"`,
        values,
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: 'WEBHOOKS',
        action: 'webhooks.delivery.retry',
        direction: 'OUTBOUND',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        metadata: { retried: rows.length, deliveryId, mode: 'mock' },
    });

    return integrationJson({ retried: rows.length, deliveries: rows });
}
