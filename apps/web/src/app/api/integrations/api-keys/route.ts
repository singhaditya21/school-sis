import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import {
    generateIntegrationApiKey,
    integrationJson,
    providerFromInput,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_SCOPES = new Set([
    '*',
    'oneroster:read',
    'scim:read',
    'scim:write',
    'tally:export',
    'lti:launch',
    'webhooks:manage',
    'webhooks:deliver',
]);

const createKeySchema = z.object({
    name: z.string().trim().min(2).max(120),
    provider: z.string().trim().default('PLATFORM'),
    scopes: z.array(z.string().trim()).min(1).max(20),
    expiresAt: z.string().datetime().optional(),
});

function sanitizeScopes(scopes: string[]): string[] {
    const normalized = [...new Set(scopes.map((scope) => scope.trim().toLowerCase()))];
    const invalid = normalized.find((scope) => !ALLOWED_SCOPES.has(scope));
    if (invalid) throw new Error(`Unsupported scope: ${invalid}`);
    return normalized;
}

export async function GET(request: Request) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    const { rows } = await pool.query(
        `SELECT id,
                name,
                provider,
                key_prefix AS "keyPrefix",
                scopes,
                status,
                expires_at AS "expiresAt",
                last_used_at AS "lastUsedAt",
                created_at AS "createdAt"
         FROM integration_api_keys
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [auth.context.tenantId],
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider: 'PLATFORM',
        action: 'api_keys.list',
        status: 'SUCCESS',
        request,
        context: { userId: auth.context.userId },
        statusCode: 200,
    });

    return integrationJson({ apiKeys: rows });
}

export async function POST(request: Request) {
    const startedAt = Date.now();
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return integrationJson({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createKeySchema.safeParse(body);
    if (!parsed.success) {
        return integrationJson({ error: parsed.error.errors[0]?.message || 'Invalid API key payload' }, { status: 400 });
    }

    let provider;
    let scopes;
    try {
        provider = providerFromInput(parsed.data.provider);
        scopes = sanitizeScopes(parsed.data.scopes);
    } catch (error) {
        return integrationJson({ error: error instanceof Error ? error.message : 'Invalid API key payload' }, { status: 400 });
    }

    const generated = generateIntegrationApiKey(provider);
    const { rows } = await pool.query(
        `INSERT INTO integration_api_keys (
            tenant_id, name, provider, key_prefix, key_hash, scopes, expires_at, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         RETURNING id,
                   name,
                   provider,
                   key_prefix AS "keyPrefix",
                   scopes,
                   status,
                   expires_at AS "expiresAt",
                   created_at AS "createdAt"`,
        [
            auth.context.tenantId,
            parsed.data.name,
            provider,
            generated.keyPrefix,
            generated.keyHash,
            JSON.stringify(scopes),
            parsed.data.expiresAt || null,
            auth.context.userId,
        ],
    );

    await recordIntegrationAudit({
        tenantId: auth.context.tenantId,
        provider,
        action: 'api_keys.create',
        status: 'SUCCESS',
        request,
        context: { userId: auth.context.userId },
        statusCode: 201,
        durationMs: Date.now() - startedAt,
        metadata: { apiKeyId: rows[0].id, scopes },
    });

    return integrationJson({ apiKey: rows[0], secret: generated.apiKey }, { status: 201 });
}
