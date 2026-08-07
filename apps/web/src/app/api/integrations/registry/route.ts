import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import {
    integrationJson,
    providerFromInput,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import { integrationRuntimeMode } from '@/lib/integrations/runtime-mode';

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
    status: z.enum(['PENDING', 'DISABLED']).default('PENDING'),
    config: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

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
        statusCode: 202,
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
    const mode = integrationRuntimeMode();
    const config = mode === 'MOCK'
        ? { ...(parsed.data.config || {}), mock: true }
        : parsed.data.config || {};
    const { rows } = await pool.query(
        `INSERT INTO integration_connections (
            tenant_id, provider, mode, status, config, scopes, created_by, updated_by
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $7)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET
            mode = EXCLUDED.mode,
            status = EXCLUDED.status,
            config = EXCLUDED.config,
            scopes = EXCLUDED.scopes,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
         RETURNING id, provider, mode, status, config, scopes, updated_at AS "updatedAt"`,
        [
            auth.context.tenantId,
            provider,
            mode,
            parsed.data.status,
            JSON.stringify(config),
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

    return integrationJson({
        integration: rows[0],
        message: parsed.data.status === 'PENDING'
            ? 'Configuration saved pending a verified live integration request.'
            : 'Integration disabled.',
    }, { status: 202 });
}
