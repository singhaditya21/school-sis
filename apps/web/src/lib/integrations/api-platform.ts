import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { QueryResult } from 'pg';
import { enterTenantContext, pool, runWithRlsBypass } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS, type ApiAuthContext } from '@/lib/auth/api';

export type IntegrationProvider = 'ONEROSTER' | 'SCIM' | 'TALLY' | 'LTI' | 'WEBHOOKS' | 'PLATFORM';
export type IntegrationDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type IntegrationAuditStatus = 'SUCCESS' | 'FAILED' | 'DENIED' | 'QUEUED';

export type IntegrationAuthContext = {
    tenantId: string;
    subjectType: 'api_key' | 'session';
    provider: IntegrationProvider;
    scopes: string[];
    apiKeyId?: string;
    userId?: string;
    role?: string;
    email?: string;
};

type ApiKeyRow = {
    id: string;
    tenantId: string;
    provider: IntegrationProvider;
    keyHash: string;
    scopes: string[];
    status: string;
    expiresAt: Date | string | null;
    tenantActive: boolean;
};

type IntegrationAuthOptions = {
    provider: IntegrationProvider;
    scopes?: string[];
    allowSession?: boolean;
    sessionRoles?: readonly string[];
};

export type IntegrationAuthResult =
    | { ok: true; context: IntegrationAuthContext }
    | { ok: false; response: NextResponse };

const DEFAULT_SESSION_ROLES = ROLE_GROUPS.tenantAdmins;
const API_KEY_PREFIX = 'ssis';

function bearerTokenFrom(request: Request): string {
    const header = request.headers.get('authorization') || '';
    return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

function timingSafeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashIntegrationApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function generateIntegrationApiKey(provider: IntegrationProvider): { apiKey: string; keyPrefix: string; keyHash: string } {
    const normalizedProvider = provider.toLowerCase();
    const publicPart = crypto.randomBytes(6).toString('base64url');
    const secretPart = crypto.randomBytes(32).toString('base64url');
    const apiKey = `${API_KEY_PREFIX}_${normalizedProvider}_${publicPart}.${secretPart}`;
    return {
        apiKey,
        keyPrefix: `${API_KEY_PREFIX}_${normalizedProvider}_${publicPart}`,
        keyHash: hashIntegrationApiKey(apiKey),
    };
}

export function integrationApiHeaders(version = 'v1'): HeadersInit {
    return {
        'X-School-SIS-API-Version': version,
        'X-School-SIS-Integration-Mode': 'mock',
    };
}

export function integrationJson(body: unknown, init: ResponseInit = {}): NextResponse {
    return NextResponse.json(body, {
        ...init,
        headers: {
            ...integrationApiHeaders(),
            ...(init.headers || {}),
        },
    });
}

function scopesAllow(granted: string[], required: string[], provider: IntegrationProvider): boolean {
    if (required.length === 0) return true;
    if (granted.includes('*')) return true;

    const providerPrefix = provider.toLowerCase();
    return required.every((scope) => {
        if (granted.includes(scope)) return true;
        const [domain] = scope.split(':');
        return granted.includes(`${domain}:*`) || granted.includes(`${providerPrefix}:*`);
    });
}

function isExpired(value: Date | string | null): boolean {
    if (!value) return false;
    return new Date(value).getTime() <= Date.now();
}

async function authenticateApiKey(
    request: Request,
    provider: IntegrationProvider,
    requiredScopes: string[],
): Promise<IntegrationAuthResult | null> {
    const apiKey = bearerTokenFrom(request);
    if (!apiKey) return null;

    const keyHash = hashIntegrationApiKey(apiKey);
    const result = await runWithRlsBypass(() => pool.query<ApiKeyRow>(
        `SELECT
            k.id,
            k.tenant_id AS "tenantId",
            k.provider,
            k.key_hash AS "keyHash",
            k.scopes,
            k.status,
            k.expires_at AS "expiresAt",
            t.is_active AS "tenantActive"
         FROM integration_api_keys k
         JOIN tenants t ON t.id = k.tenant_id
         WHERE k.key_hash = $1
        LIMIT 1`,
        [keyHash],
    )) as QueryResult<ApiKeyRow>;

    const key = result.rows[0];
    if (!key || !timingSafeEqual(key.keyHash || keyHash, keyHash)) {
        return {
            ok: false,
            response: integrationJson({ error: 'Invalid integration API key' }, { status: 401 }),
        };
    }

    if (!key.tenantActive || key.status !== 'ACTIVE' || isExpired(key.expiresAt)) {
        return {
            ok: false,
            response: integrationJson({ error: 'Integration API key is inactive or expired' }, { status: 401 }),
        };
    }

    if (provider !== 'PLATFORM' && key.provider !== provider && key.provider !== 'PLATFORM') {
        return {
            ok: false,
            response: integrationJson({ error: 'Integration API key is not valid for this provider' }, { status: 403 }),
        };
    }

    const scopes = Array.isArray(key.scopes) ? key.scopes : [];
    if (!scopesAllow(scopes, requiredScopes, provider)) {
        return {
            ok: false,
            response: integrationJson({ error: 'Integration API key is missing required scope' }, { status: 403 }),
        };
    }

    await runWithRlsBypass(() => pool.query(
        `UPDATE integration_api_keys
         SET last_used_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [key.id],
    ));

    enterTenantContext(key.tenantId);
    return {
        ok: true,
        context: {
            tenantId: key.tenantId,
            subjectType: 'api_key',
            provider,
            scopes,
            apiKeyId: key.id,
        },
    };
}

export async function authenticateIntegrationRequest(
    request: Request,
    options: IntegrationAuthOptions,
): Promise<IntegrationAuthResult> {
    const requiredScopes = options.scopes || [];
    const apiKeyAuth = await authenticateApiKey(request, options.provider, requiredScopes);
    if (apiKeyAuth) return apiKeyAuth;

    if (options.allowSession === false) {
        return {
            ok: false,
            response: integrationJson({ error: 'Integration API key is required' }, { status: 401 }),
        };
    }

    const sessionAuth = await requireApiAuth(options.sessionRoles || DEFAULT_SESSION_ROLES);
    if (sessionAuth.ok === false) return sessionAuth;

    const context: ApiAuthContext = sessionAuth.context;
    return {
        ok: true,
        context: {
            tenantId: context.tenantId,
            subjectType: 'session',
            provider: options.provider,
            scopes: ['session'],
            userId: context.userId,
            role: context.role,
            email: context.email,
        },
    };
}

export async function ensureMockIntegrationConnection(params: {
    tenantId: string;
    provider: IntegrationProvider;
    scopes: string[];
    userId?: string;
}) {
    await pool.query(
        `INSERT INTO integration_connections (
            tenant_id, provider, mode, status, config, scopes, created_by, updated_by
         )
         VALUES ($1, $2, 'MOCK', 'ACTIVE', $3::jsonb, $4::jsonb, $5, $5)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET
            mode = 'MOCK',
            status = 'ACTIVE',
            scopes = EXCLUDED.scopes,
            config = integration_connections.config || EXCLUDED.config,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()`,
        [
            params.tenantId,
            params.provider,
            JSON.stringify({ mock: true, lastEnsuredAt: new Date().toISOString() }),
            JSON.stringify(params.scopes),
            params.userId || null,
        ],
    );
}

export async function recordIntegrationAudit(params: {
    tenantId: string;
    provider: IntegrationProvider;
    action: string;
    status: IntegrationAuditStatus;
    direction?: IntegrationDirection;
    request?: Request;
    context?: Partial<IntegrationAuthContext>;
    statusCode?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
    error?: string;
}) {
    try {
        const url = params.request ? new URL(params.request.url) : null;
        await pool.query(
            `INSERT INTO integration_audit_logs (
                tenant_id, provider, action, direction, status, api_key_id, actor_user_id,
                request_id, idempotency_key, http_method, path, status_code, duration_ms,
                ip_address, user_agent, metadata, error
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)`,
            [
                params.tenantId,
                params.provider,
                params.action,
                params.direction || 'INBOUND',
                params.status,
                params.context?.apiKeyId || null,
                params.context?.userId || null,
                params.request?.headers.get('x-request-id') || crypto.randomUUID(),
                params.request?.headers.get('idempotency-key') || null,
                params.request?.method || null,
                url ? `${url.pathname}${url.search}` : null,
                params.statusCode || null,
                params.durationMs || null,
                params.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
                params.request?.headers.get('user-agent') || null,
                JSON.stringify(params.metadata || {}),
                params.error || null,
            ],
        );
    } catch (error) {
        console.error('[integrations] failed to record audit log:', error);
    }
}

export function providerFromInput(value: unknown): IntegrationProvider {
    const normalized = String(value || '').trim().toUpperCase();
    if (['ONEROSTER', 'SCIM', 'TALLY', 'LTI', 'WEBHOOKS', 'PLATFORM'].includes(normalized)) {
        return normalized as IntegrationProvider;
    }
    throw new Error('Unsupported integration provider.');
}
