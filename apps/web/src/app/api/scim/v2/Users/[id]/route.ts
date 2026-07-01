import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { recordIntegrationAudit } from '@/lib/integrations/api-platform';
import {
    authenticateScimRequest,
    getScimUserById,
    isValidUuid,
    parseScimRole,
    primaryEmailFromScimPayload,
    scimError,
    toScimUser,
    type ScimUserRow,
} from '@/lib/auth/scim';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
    params: Promise<{ id: string }>;
};

type ScimUserUpdates = {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
};

const scimPatchSchema = z.object({
    Operations: z.array(z.object({
        op: z.string().optional(),
        path: z.string().optional(),
        value: z.unknown().optional(),
    })).optional(),
}).passthrough();

function applyObjectPatch(value: unknown, updates: ScimUserUpdates): NextResponse | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return scimError('Patch value must be an object.', 400);
    }

    const record = value as Record<string, unknown>;
    const email = primaryEmailFromScimPayload(record);
    if (email) updates.email = email;

    if (typeof record.active === 'boolean') {
        updates.isActive = record.active;
    }

    if (record.name && typeof record.name === 'object') {
        const name = record.name as Record<string, unknown>;
        if (typeof name.givenName === 'string' && name.givenName.trim()) {
            updates.firstName = name.givenName.trim();
        }
        if (typeof name.familyName === 'string' && name.familyName.trim()) {
            updates.lastName = name.familyName.trim();
        }
    }

    if ('roles' in record) {
        const roleResult = parseScimRole(record.roles);
        if (roleResult.ok === false) return roleResult.response;
        if (roleResult.role) updates.role = roleResult.role;
    }

    return null;
}

function applyPathPatch(path: string, value: unknown, updates: ScimUserUpdates): NextResponse | null {
    const normalizedPath = path.trim().toLowerCase();

    if (normalizedPath === 'active') {
        if (typeof value !== 'boolean') return scimError('active must be a boolean.', 400);
        updates.isActive = value;
        return null;
    }

    if (normalizedPath === 'username' || normalizedPath === 'emails' || normalizedPath === 'emails.value') {
        const email = typeof value === 'string'
            ? value.trim().toLowerCase()
            : primaryEmailFromScimPayload({ emails: Array.isArray(value) ? value : [value] });
        if (!email) return scimError('A valid email value is required.', 400);
        updates.email = email;
        return null;
    }

    if (normalizedPath === 'name.givenname') {
        if (typeof value !== 'string' || !value.trim()) return scimError('name.givenName must be a string.', 400);
        updates.firstName = value.trim();
        return null;
    }

    if (normalizedPath === 'name.familyname') {
        if (typeof value !== 'string' || !value.trim()) return scimError('name.familyName must be a string.', 400);
        updates.lastName = value.trim();
        return null;
    }

    if (normalizedPath === 'roles' || normalizedPath === 'roles.value') {
        const roleResult = parseScimRole(value);
        if (roleResult.ok === false) return roleResult.response;
        if (roleResult.role) updates.role = roleResult.role;
        return null;
    }

    return scimError(`Unsupported SCIM patch path '${path}'.`, 400);
}

function updatesFromPatchPayload(payload: Record<string, unknown>): { ok: true; updates: ScimUserUpdates } | { ok: false; response: NextResponse } {
    const updates: ScimUserUpdates = {};

    if (Array.isArray(payload.Operations)) {
        for (const operation of payload.Operations) {
            if (!operation || typeof operation !== 'object') {
                return { ok: false, response: scimError('SCIM patch operations must be objects.', 400) };
            }

            const opRecord = operation as Record<string, unknown>;
            const op = typeof opRecord.op === 'string' ? opRecord.op.toLowerCase() : 'replace';
            if (op !== 'add' && op !== 'replace') {
                return { ok: false, response: scimError(`Unsupported SCIM patch op '${op}'.`, 400) };
            }

            const path = typeof opRecord.path === 'string' ? opRecord.path : '';
            const error = path
                ? applyPathPatch(path, opRecord.value, updates)
                : applyObjectPatch(opRecord.value, updates);
            if (error) return { ok: false, response: error };
        }
    } else {
        const error = applyObjectPatch(payload, updates);
        if (error) return { ok: false, response: error };
    }

    return { ok: true, updates };
}

async function updateScimUser(
    tenantId: string,
    id: string,
    updates: ScimUserUpdates,
): Promise<ScimUserRow | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    function setColumn(column: string, value: unknown) {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
    }

    if (updates.email !== undefined) setColumn('email', updates.email);
    if (updates.firstName !== undefined) setColumn('first_name', updates.firstName);
    if (updates.lastName !== undefined) setColumn('last_name', updates.lastName);
    if (updates.role !== undefined) setColumn('role', updates.role);
    if (updates.isActive !== undefined) setColumn('is_active', updates.isActive);

    if (assignments.length === 0) return getScimUserById(tenantId, id);

    values.push(tenantId, id);
    const tenantParam = values.length - 1;
    const idParam = values.length;

    const { rows } = await pool.query<ScimUserRow>(
        `UPDATE users
         SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE tenant_id = $${tenantParam} AND id = $${idParam}
         RETURNING
            id,
            email,
            first_name AS "firstName",
            last_name AS "lastName",
            role,
            is_active AS "isActive",
            created_at AS "createdAt",
            updated_at AS "updatedAt"`,
        values,
    );

    return rows[0] || null;
}

export async function GET(request: Request, { params }: RouteContext) {
    const startedAt = Date.now();
    const auth = await authenticateScimRequest(request);
    if (auth.ok === false) return auth.response;

    const { id } = await params;
    if (!isValidUuid(id)) return scimError('Invalid user ID.', 400);

    const user = await getScimUserById(auth.tenantId, id);
    if (!user) return scimError('User not found.', 404, 'notFound');

    await recordIntegrationAudit({
        tenantId: auth.tenantId,
        provider: 'SCIM',
        action: 'scim.users.read',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        metadata: { userId: id, mode: 'mock' },
    });

    return NextResponse.json(toScimUser(user, request));
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const startedAt = Date.now();
    const auth = await authenticateScimRequest(request);
    if (auth.ok === false) return auth.response;

    const { id } = await params;
    if (!isValidUuid(id)) return scimError('Invalid user ID.', 400);

    let rawBody: unknown;
    try {
        rawBody = await request.json();
    } catch {
        return scimError('Invalid JSON body.', 400);
    }

    const parsed = scimPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
        return scimError(parsed.error.errors[0]?.message || 'Invalid SCIM patch payload.', 400);
    }

    const updateResult = updatesFromPatchPayload(parsed.data as Record<string, unknown>);
    if (updateResult.ok === false) return updateResult.response;

    if (updateResult.updates.email && !z.string().email().safeParse(updateResult.updates.email).success) {
        return scimError('Email is invalid.', 400);
    }

    if (updateResult.updates.email) {
        const duplicate = await pool.query(
            `SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) AND id <> $3 LIMIT 1`,
            [auth.tenantId, updateResult.updates.email, id],
        );
        if (duplicate.rows.length > 0) {
            return scimError('A user with this email already exists in this tenant.', 409, 'uniqueness');
        }
    }

    const updated = await updateScimUser(auth.tenantId, id, updateResult.updates);
    if (!updated) return scimError('User not found.', 404, 'notFound');

    await recordIntegrationAudit({
        tenantId: auth.tenantId,
        provider: 'SCIM',
        action: 'scim.users.patch',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        metadata: { userId: id, fields: Object.keys(updateResult.updates), mode: 'mock' },
    });

    return NextResponse.json(toScimUser(updated, request));
}

export async function DELETE(request: Request, { params }: RouteContext) {
    const startedAt = Date.now();
    const auth = await authenticateScimRequest(request);
    if (auth.ok === false) return auth.response;

    const { id } = await params;
    if (!isValidUuid(id)) return scimError('Invalid user ID.', 400);

    const updated = await updateScimUser(auth.tenantId, id, { isActive: false });
    if (!updated) return scimError('User not found.', 404, 'notFound');

    await recordIntegrationAudit({
        tenantId: auth.tenantId,
        provider: 'SCIM',
        action: 'scim.users.deactivate',
        status: 'SUCCESS',
        request,
        context: auth.context,
        statusCode: 204,
        durationMs: Date.now() - startedAt,
        metadata: { userId: id, mode: 'mock' },
    });

    return new NextResponse(null, { status: 204 });
}
