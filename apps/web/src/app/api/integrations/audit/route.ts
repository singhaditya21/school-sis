import { pool } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { integrationJson, providerFromInput } from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const providerParam = url.searchParams.get('provider');
    const values: unknown[] = [auth.context.tenantId];
    let providerFilter = '';

    if (providerParam) {
        try {
            values.push(providerFromInput(providerParam));
            providerFilter = `AND provider = $${values.length}`;
        } catch {
            return integrationJson({ error: 'Invalid provider filter' }, { status: 400 });
        }
    }

    values.push(limit);
    const { rows } = await pool.query(
        `SELECT id,
                provider,
                action,
                direction,
                status,
                request_id AS "requestId",
                idempotency_key AS "idempotencyKey",
                http_method AS "httpMethod",
                path,
                status_code AS "statusCode",
                duration_ms AS "durationMs",
                metadata,
                error,
                created_at AS "createdAt"
         FROM integration_audit_logs
         WHERE tenant_id = $1
         ${providerFilter}
         ORDER BY created_at DESC
         LIMIT $${values.length}`,
        values,
    );

    return integrationJson({ auditLogs: rows });
}
