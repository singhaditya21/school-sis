import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    authenticateIntegrationRequest,
    ensureMockIntegrationConnection,
    type IntegrationAuthContext,
} from '@/lib/integrations/api-platform';

export const SCIM_CORE_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export const SCIM_ALLOWED_ROLES = new Set([
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'TEACHER',
    'TRANSPORT_MANAGER',
    'PARENT',
    'STUDENT',
]);

export type ScimUserRow = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
};

export type ScimAuthResult =
    | { ok: true; tenantId: string; context: IntegrationAuthContext }
    | { ok: false; response: NextResponse };

export function isValidUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function scimError(detail: string, status = 400, scimType = 'invalidValue'): NextResponse {
    return NextResponse.json(
        {
            schemas: [SCIM_ERROR_SCHEMA],
            scimType,
            detail,
            status: String(status),
        },
        { status },
    );
}

export async function authenticateScimRequest(request: Request): Promise<ScimAuthResult> {
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'SCIM',
        scopes: request.method === 'GET' ? ['scim:read'] : ['scim:write'],
        allowSession: false,
    });
    if (auth.ok === false) return auth;

    const { rows } = await pool.query(
        `SELECT id FROM tenants WHERE id = $1 AND is_active = true LIMIT 1`,
        [auth.context.tenantId],
    );
    if (rows.length === 0) {
        return { ok: false, response: scimError('Tenant is inactive or not found.', 404, 'notFound') };
    }

    await ensureMockIntegrationConnection({
        tenantId: auth.context.tenantId,
        provider: 'SCIM',
        scopes: ['scim:read', 'scim:write'],
        userId: auth.context.userId,
    });

    return { ok: true, tenantId: auth.context.tenantId, context: auth.context };
}

function roleCandidateFrom(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        const primary = value.find((entry) => entry && typeof entry === 'object' && (entry as { primary?: boolean }).primary);
        return roleCandidateFrom(primary || value[0]);
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return roleCandidateFrom(record.value || record.display || record.type);
    }

    return null;
}

export function parseScimRole(value: unknown, fallback?: string): { ok: true; role?: string } | { ok: false; response: NextResponse } {
    const candidate = roleCandidateFrom(value);
    if (!candidate) return { ok: true, role: fallback };

    const normalized = candidate
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!SCIM_ALLOWED_ROLES.has(normalized)) {
        return { ok: false, response: scimError(`Role '${candidate}' is not allowed for tenant provisioning.`, 400) };
    }

    return { ok: true, role: normalized };
}

export function primaryEmailFromScimPayload(payload: Record<string, unknown>): string | null {
    const userName = typeof payload.userName === 'string' ? payload.userName.trim().toLowerCase() : '';
    if (userName) return userName;

    const emails = Array.isArray(payload.emails) ? payload.emails : [];
    const primaryEmail = emails.find((entry) => entry && typeof entry === 'object' && (entry as { primary?: boolean }).primary);
    const candidate = primaryEmail || emails[0];

    if (typeof candidate === 'string') return candidate.trim().toLowerCase();
    if (candidate && typeof candidate === 'object') {
        const value = (candidate as Record<string, unknown>).value;
        if (typeof value === 'string') return value.trim().toLowerCase();
    }

    return null;
}

export function scimNameFromPayload(payload: Record<string, unknown>): { firstName: string; lastName: string } {
    const name = payload.name && typeof payload.name === 'object' ? payload.name as Record<string, unknown> : {};
    const firstName = typeof name.givenName === 'string' && name.givenName.trim()
        ? name.givenName.trim()
        : 'Provisioned';
    const lastName = typeof name.familyName === 'string' && name.familyName.trim()
        ? name.familyName.trim()
        : 'User';

    return { firstName, lastName };
}

export function toScimUser(row: ScimUserRow, request: Request): Record<string, unknown> {
    const url = new URL(request.url);
    const location = `${url.origin}/api/scim/v2/Users/${row.id}`;
    const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email;

    return {
        schemas: [SCIM_CORE_USER_SCHEMA],
        id: row.id,
        userName: row.email,
        name: {
            givenName: row.firstName,
            familyName: row.lastName,
            formatted: displayName,
        },
        displayName,
        active: row.isActive,
        emails: [
            {
                value: row.email,
                primary: true,
                type: 'work',
            },
        ],
        roles: [
            {
                value: row.role,
                primary: true,
            },
        ],
        meta: {
            resourceType: 'User',
            created: new Date(row.createdAt).toISOString(),
            lastModified: new Date(row.updatedAt).toISOString(),
            location,
        },
    };
}

export async function getScimUserById(tenantId: string, id: string): Promise<ScimUserRow | null> {
    const { rows } = await pool.query<ScimUserRow>(
        `SELECT
            id,
            email,
            first_name AS "firstName",
            last_name AS "lastName",
            role,
            is_active AS "isActive",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
         FROM users
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, id],
    );

    return rows[0] || null;
}
