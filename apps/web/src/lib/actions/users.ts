'use server';

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { sql, runWithTenantContext } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { encryptEmail, encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';

export interface AdminUser {
    id: string;
    tenantId: string | null;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    active: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
}

type Result<T> = { success: boolean; data?: T; error?: string };

const USER_ADMIN_ROLES = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SCHOOL_ADMIN'];

async function requireUserAdmin() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.tenantId) {
        return { ok: false as const, error: 'Not authenticated' };
    }
    if (!USER_ADMIN_ROLES.includes(session.role)) {
        return { ok: false as const, error: 'You do not have permission to manage users.' };
    }
    return { ok: true as const, tenantId: session.tenantId };
}

type UserRow = {
    id: string;
    tenant_id: string | null;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    created_at: Date | null;
    last_login_at: Date | null;
};

function mapRow(r: UserRow): AdminUser {
    return {
        id: r.id,
        tenantId: r.tenant_id,
        email: r.email == null ? r.email : decryptFieldTolerant(r.email),
        firstName: r.first_name,
        lastName: r.last_name,
        role: r.role,
        active: r.is_active,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
    };
}

/** List all users in the caller's tenant. */
export async function listUsers(): Promise<Result<AdminUser[]>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    try {
        const rows = await runWithTenantContext(auth.tenantId, async () => {
            return sql<UserRow>`
                SELECT id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
                FROM users
                WHERE tenant_id = ${auth.tenantId}
                ORDER BY created_at DESC
                LIMIT 500
            `;
        });
        return { success: true, data: rows.map(mapRow) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to load users' };
    }
}

/** Create a user in the caller's tenant. */
export async function createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password: string;
}): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const email = input.email?.trim().toLowerCase();
    if (!email) return { success: false, error: 'Email is required.' };
    if (!input.password || input.password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters.' };
    }

    try {
        const passwordHash = await hash(input.password, 12);
        const row = await runWithTenantContext(auth.tenantId, async () => {
            const existingCount = await sql`
                SELECT 1 FROM users WHERE tenant_id = ${auth.tenantId} AND (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR email = ${email})
            `.execute();
            if (existingCount) throw new Error('A user with that email already exists.');
            const rows = await sql<UserRow>`
                INSERT INTO users (tenant_id, email_enc, password_hash, first_name, last_name, role)
                VALUES (${auth.tenantId}, ${encryptEmail(email)}, ${passwordHash}, ${input.firstName ?? ''}, ${input.lastName ?? ''}, ${input.role})
                RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
            `;
            return rows[0];
        });
        return { success: true, data: mapRow(row) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to create user' };
    }
}

/** Update a user's profile and role in the caller's tenant. */
export async function updateUser(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
}): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const email = input.email?.trim().toLowerCase();
    if (!email) return { success: false, error: 'Email is required.' };
    if (!input.firstName?.trim()) return { success: false, error: 'First name is required.' };

    try {
        const row = await runWithTenantContext(auth.tenantId, async () => {
            const dupRows = await sql<{ exists: number }>`
                SELECT 1 AS exists
                FROM users
                WHERE tenant_id = ${auth.tenantId}
                  AND id <> ${input.userId}
                  AND (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR email = ${email})
                LIMIT 1
            `.rows();
            if (dupRows.length > 0) {
                throw new Error('A user with that email already exists.');
            }

            const updatedRows = await sql<UserRow>`
                UPDATE users
                SET email_enc = ${encryptEmail(email)},
                    first_name = ${input.firstName.trim()},
                    last_name = ${(input.lastName ?? '').trim()},
                    role = ${input.role}::user_role,
                    updated_at = NOW()
                WHERE id = ${input.userId} AND tenant_id = ${auth.tenantId}
                RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
            `.rows();
            if (!updatedRows[0]) throw new Error('User not found.');
            return updatedRows[0];
        });
        return { success: true, data: mapRow(row) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to update user' };
    }
}

/** Activate/deactivate a user in the caller's tenant. */
export async function setUserActive(userId: string, active: boolean): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    try {
        const row = await runWithTenantContext(auth.tenantId, async () => {
            const rows = await sql<UserRow>`
                UPDATE users SET is_active = ${active}, updated_at = NOW()
                WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
                RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
            `;
            if (!rows[0]) throw new Error('User not found.');
            return rows[0];
        });
        return { success: true, data: mapRow(row) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to update user' };
    }
}

/** Reset a user's password to a generated temporary one, returned once. */
export async function resetUserPassword(userId: string): Promise<Result<{ temporaryPassword: string }>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    try {
        const temporaryPassword = randomBytes(9).toString('base64url');
        const passwordHash = await hash(temporaryPassword, 12);
        const updated = await runWithTenantContext(auth.tenantId, async () => {
            const rowCount = await sql`
                UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
            `.execute();
            return rowCount > 0;
        });
        if (!updated) return { success: false, error: 'User not found.' };
        return { success: true, data: { temporaryPassword } };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to reset password' };
    }
}
