import { pool } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { integrationJson, recordIntegrationAudit } from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, { params }: RouteContext) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    const { id } = await params;
    const { rows } = await pool.query(
        `UPDATE integration_api_keys
         SET status = 'REVOKED',
             revoked_by = $1,
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $2
           AND tenant_id = $3
           AND status <> 'REVOKED'
         RETURNING id, provider`,
        [auth.context.userId, id, auth.context.tenantId],
    );

    if (rows.length === 0) {
        return integrationJson({ error: 'API key not found' }, { status: 404 });
    }

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: rows[0].provider,
        action: 'api_keys.revoke',
        status: 'SUCCESS',
        request,
        context: { userId: auth.context.userId },
        statusCode: 200,
        metadata: { apiKeyId: id },
    });

    return integrationJson({ success: true });
}
