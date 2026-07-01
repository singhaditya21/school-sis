import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { recordIntegrationAudit } from '@/lib/integrations/api-platform';
import {
    authenticateScimRequest,
    parseScimRole,
    primaryEmailFromScimPayload,
    scimError,
    scimNameFromPayload,
    SCIM_LIST_SCHEMA,
    toScimUser,
    type ScimUserRow,
} from '@/lib/auth/scim';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const scimCreateSchema = z.object({
    userName: z.string().optional(),
    active: z.boolean().optional(),
    emails: z.array(z.unknown()).optional(),
    roles: z.array(z.unknown()).optional(),
    name: z.object({
        givenName: z.string().optional(),
        familyName: z.string().optional(),
    }).passthrough().optional(),
}).passthrough();

function parseUserNameFilter(filter: string | null): string | null | undefined {
    if (!filter) return undefined;

    const match = filter.match(/^\s*userName\s+eq\s+"([^"]+)"\s*$/i)
        || filter.match(/^\s*userName\s+eq\s+([^\s]+)\s*$/i);
    if (!match) return null;

    return match[1].trim().toLowerCase();
}

function readPaging(request: Request): { startIndex: number; count: number } {
    const url = new URL(request.url);
    const startIndex = Math.max(1, Number(url.searchParams.get('startIndex') || 1) || 1);
    const count = Math.min(100, Math.max(1, Number(url.searchParams.get('count') || 100) || 100));
    return { startIndex, count };
}

export async function GET(request: Request) {
    const startedAt = Date.now();
    const auth = await authenticateScimRequest(request);
    if (auth.ok === false) return auth.response;

    const url = new URL(request.url);
    const filteredEmail = parseUserNameFilter(url.searchParams.get('filter'));
    if (filteredEmail === null) {
        return scimError('Only userName eq "email@example.com" filters are supported.', 400);
    }

    const { startIndex, count } = readPaging(request);
    const offset = startIndex - 1;
    const values: unknown[] = [auth.tenantId];
    let filterClause = '';

    if (filteredEmail) {
        values.push(filteredEmail);
        filterClause = `AND lower(email) = lower($${values.length})`;
    }

    const totalResult = await pool.query<{ total: string }>(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE tenant_id = $1
         ${filterClause}`,
        values,
    );

    values.push(count, offset);
    const rowsResult = await pool.query<ScimUserRow>(
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
         WHERE tenant_id = $1
         ${filterClause}
         ORDER BY email ASC
         LIMIT $${values.length - 1}
         OFFSET $${values.length}`,
        values,
    );

    const responseBody = {
        schemas: [SCIM_LIST_SCHEMA],
        totalResults: Number(totalResult.rows[0]?.total || 0),
        startIndex,
        itemsPerPage: rowsResult.rows.length,
        Resources: rowsResult.rows.map((row) => toScimUser(row, request)),
    };

    await recordIntegrationAudit({
        tenantId: auth.tenantId,
        provider: 'SCIM',
        action: 'scim.users.list',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        metadata: { totalResults: responseBody.totalResults, filtered: Boolean(filteredEmail), mode: 'mock' },
    });

    return NextResponse.json(responseBody);
}

export async function POST(request: Request) {
    const startedAt = Date.now();
    const auth = await authenticateScimRequest(request);
    if (auth.ok === false) return auth.response;

    let rawBody: unknown;
    try {
        rawBody = await request.json();
    } catch {
        return scimError('Invalid JSON body.', 400);
    }

    const parsed = scimCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
        return scimError(parsed.error.errors[0]?.message || 'Invalid SCIM user payload.', 400);
    }

    const payload = parsed.data as Record<string, unknown>;
    const email = primaryEmailFromScimPayload(payload);
    if (!email || !z.string().email().safeParse(email).success) {
        return scimError('A valid userName or primary email is required.', 400);
    }

    const roleResult = parseScimRole(payload.roles, 'TEACHER');
    if (roleResult.ok === false) return roleResult.response;

    const { firstName, lastName } = scimNameFromPayload(payload);

    const duplicate = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`,
        [auth.tenantId, email],
    );
    if (duplicate.rows.length > 0) {
        return scimError('A user with this email already exists in this tenant.', 409, 'uniqueness');
    }

    const randomPassword = crypto.randomBytes(24).toString('base64url');
    const passwordHash = await hash(randomPassword, 12);
    const active = payload.active !== false;

    const created = await pool.query<ScimUserRow>(
        `INSERT INTO users (
            tenant_id,
            email,
            password_hash,
            first_name,
            last_name,
            role,
            is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
            id,
            email,
            first_name AS "firstName",
            last_name AS "lastName",
            role,
            is_active AS "isActive",
            created_at AS "createdAt",
            updated_at AS "updatedAt"`,
        [auth.tenantId, email, passwordHash, firstName, lastName, roleResult.role, active],
    );

    const body = toScimUser(created.rows[0], request);
    const location = (body.meta as { location: string }).location;
    await recordIntegrationAudit({
        tenantId: auth.tenantId,
        provider: 'SCIM',
        action: 'scim.users.create',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 201,
        durationMs: Date.now() - startedAt,
        metadata: { userId: created.rows[0].id, role: roleResult.role, active, mode: 'mock' },
    });

    return NextResponse.json(body, {
        status: 201,
        headers: { Location: location },
    });
}
