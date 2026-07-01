import { pool } from '@/lib/db';
import {
    authenticateIntegrationRequest,
    integrationJson,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const startedAt = Date.now();
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'PLATFORM',
        scopes: [],
        allowSession: false,
    });
    if (auth.ok === false) return auth.response;

    const { rows } = await pool.query(
        `SELECT provider, mode, status, scopes, updated_at AS "updatedAt"
         FROM integration_connections
         WHERE tenant_id = $1
         ORDER BY provider ASC`,
        [auth.context.tenantId],
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: 'PLATFORM',
        action: 'api.v1.status',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
    });

    return integrationJson({
        tenantId: auth.context.tenantId,
        subjectType: auth.context.subjectType,
        scopes: auth.context.scopes,
        mode: 'mock',
        integrations: rows,
    });
}
