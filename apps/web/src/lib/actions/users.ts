'use server';

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { pool, runWithRlsBypass } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

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

const SELECT_COLS =
    'id, tenant_id, email, first_name, last_name, role, is_active, created_at, last_login_at';

function mapRow(r: UserRow): AdminUser {
    return {
        id: r.id,
        tenantId: r.tenant_id,
        email: r.email,
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
        const rows = await runWithRlsBypass(async () => {
            const res = await pool.query<UserRow>(
                `SELECT ${SELECT_COLS} FROM users WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 500`,
                [auth.tenantId],
            );
            return res.rows;
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
        const row = await runWithRlsBypass(async () => {
            const existing = await pool.query('SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2', [auth.tenantId, email]);
            if (existing.rowCount) throw new Error('A user with that email already exists.');
            const res = await pool.query<UserRow>(
                `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING ${SELECT_COLS}`,
                [auth.tenantId, email, passwordHash, input.firstName ?? '', input.lastName ?? '', input.role],
            );
            return res.rows[0];
        });
        return { success: true, data: mapRow(row) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to create user' };
    }
}

/** Activate/deactivate a user in the caller's tenant. */
export async function setUserActive(userId: string, active: boolean): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    try {
        const row = await runWithRlsBypass(async () => {
            const res = await pool.query<UserRow>(
                `UPDATE users SET is_active = $1, updated_at = NOW()
                 WHERE id = $2 AND tenant_id = $3 RETURNING ${SELECT_COLS}`,
                [active, userId, auth.tenantId],
            );
            if (!res.rows[0]) throw new Error('User not found.');
            return res.rows[0];
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
        const updated = await runWithRlsBypass(async () => {
            const res = await pool.query(
                `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                [passwordHash, userId, auth.tenantId],
            );
            return (res.rowCount ?? 0) > 0;
        });
        if (!updated) return { success: false, error: 'User not found.' };
        return { success: true, data: { temporaryPassword } };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to reset password' };
    }
}
