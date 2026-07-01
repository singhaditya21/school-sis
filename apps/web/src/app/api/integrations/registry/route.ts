import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import {
    ensureMockIntegrationConnection,
    integrationJson,
    type IntegrationProvider,
    providerFromInput,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const providerScopes: Record<string, string[]> = {
    ONEROSTER: ['oneroster:read'],
    SCIM: ['scim:read', 'scim:write'],
    TALLY: ['tally:export'],
    LTI: ['lti:launch'],
    WEBHOOKS: ['webhooks:manage', 'webhooks:deliver'],
    PLATFORM: ['*'],
};

const upsertSchema = z.object({
    provider: z.string().trim(),
    status: z.enum(['ACTIVE', 'DISABLED', 'ERROR']).default('ACTIVE'),
    config: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    for (const [provider, scopes] of Object.entries(providerScopes)) {
        if (provider === 'PLATFORM') continue;
        await ensureMockIntegrationConnection({
            tenantId: auth.context.tenantId,
            provider: provider as IntegrationProvider,
            scopes,
            userId: auth.context.userId,
        });
    }

    const { rows } = await pool.query(
        `SELECT id,
                provider,
                mode,
                status,
                config,
                scopes,
                last_sync_at AS "lastSyncAt",
                last_success_at AS "lastSuccessAt",
                last_failure_at AS "lastFailureAt",
                last_error AS "lastError",
                updated_at AS "updatedAt"
         FROM integration_connections
         WHERE tenant_id = $1
         ORDER BY provider ASC`,
        [auth.context.tenantId],
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: 'PLATFORM',
        action: 'registry.list',
        status: 'SUCCESS',
        request,
        context: { userId: auth.context.userId },
        statusCode: 200,
    });

    return integrationJson({ integrations: rows });
}

export async function POST(request: Request) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return integrationJson({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = upsertSchema.safeParse(payload);
    if (!parsed.success) {
        return integrationJson({ error: parsed.error.errors[0]?.message || 'Invalid integration payload' }, { status: 400 });
    }

    let provider;
    try {
        provider = providerFromInput(parsed.data.provider);
    } catch (error) {
        return integrationJson({ error: error instanceof Error ? error.message : 'Invalid provider' }, { status: 400 });
    }

    const scopes = providerScopes[provider] || [];
    const { rows } = await pool.query(
        `INSERT INTO integration_connections (
            tenant_id, provider, mode, status, config, scopes, created_by, updated_by
         )
         VALUES ($1, $2, 'MOCK', $3, $4::jsonb, $5::jsonb, $6, $6)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET
            mode = 'MOCK',
            status = EXCLUDED.status,
            config = EXCLUDED.config,
            scopes = EXCLUDED.scopes,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
         RETURNING id, provider, mode, status, config, scopes, updated_at AS "updatedAt"`,
        [
            auth.context.tenantId,
            provider,
            parsed.data.status,
            JSON.stringify({ ...(parsed.data.config || {}), mock: true }),
            JSON.stringify(scopes),
            auth.context.userId,
        ],
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider,
        action: 'registry.upsert',
        status: 'SUCCESS',
        request,
        context: { userId: auth.context.userId },
        statusCode: 200,
        metadata: { status: parsed.data.status },
    });

    return integrationJson({ integration: rows[0] });
}
