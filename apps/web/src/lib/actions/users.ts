'use server';

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, runWithTenantContext } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import {
    canAssignUserRole,
    canManageUserRole,
    getAssignableUserRoles,
    isUserManagerRole,
    normalizeUserRole,
} from '@/lib/users/role-policy';

export interface AdminUser {
    id: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    active: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
    isCurrentUser: boolean;
    canManage: boolean;
}

export interface UserManagementSnapshot {
    users: AdminUser[];
    viewer: {
        userId: string;
        role: string;
    };
    assignableRoles: string[];
}

type Result<T> = { success: boolean; data?: T; error?: string };

type UserAdminContext = {
    userId: string;
    tenantId: string;
    role: string;
};

type UserRow = {
    id: string;
    tenant_id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    created_at: Date | null;
    last_login_at: Date | null;
};

type UserMutationSnapshot = Pick<
    UserRow,
    'id' | 'email' | 'first_name' | 'last_name' | 'role' | 'is_active'
>;

const SELECT_COLS =
    'id, tenant_id, email, first_name, last_name, role, is_active, created_at, last_login_at';

const userIdSchema = z.string().uuid('Invalid user id.');
const emailSchema = z.string().trim().email('Enter a valid email address.').max(255).transform((value) => value.toLowerCase());
const nameSchema = z.string().trim().min(1, 'First and last name are required.').max(100);
const TEMPORARY_PASSWORD_TTL_HOURS = 24;

const createUserSchema = z.object({
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    role: z.string().trim().min(1),
    password: z.string().min(12, 'Password must be at least 12 characters.').max(128),
}).strict();

const updateUserProfileSchema = z.object({
    userId: userIdSchema,
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
}).strict();

async function requireUserAdmin(): Promise<
    { ok: true; context: UserAdminContext }
    | { ok: false; error: string }
> {
    const session = await getSession();
    if (session.passwordChangeRequired) {
        return { ok: false, error: 'Change your temporary password before managing users.' };
    }
    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return { ok: false, error: 'Not authenticated' };
    }
    if (!isUserManagerRole(session.role)) {
        return { ok: false, error: 'You do not have permission to manage users.' };
    }
    return {
        ok: true,
        context: {
            userId: session.userId,
            tenantId: session.tenantId,
            role: session.role,
        },
    };
}

function mapRow(row: UserRow, actor: UserAdminContext): AdminUser {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        active: row.is_active,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
        isCurrentUser: row.id === actor.userId,
        canManage: row.id !== actor.userId && canManageUserRole(actor.role, row.role),
    };
}

function validationError(error: z.ZodError): string {
    return error.errors[0]?.message || 'Invalid user data.';
}

function cannotManageError(): string {
    return 'User not found or you cannot manage a peer or higher-privilege account.';
}

function temporaryPasswordExpiresAt(): Date {
    return new Date(Date.now() + TEMPORARY_PASSWORD_TTL_HOURS * 60 * 60 * 1000);
}

function isTenantEmailConflict(error: unknown): boolean {
    return Boolean(
        error
        && typeof error === 'object'
        && (error as { code?: string }).code === '23505'
        && String((error as { constraint?: string }).constraint || '').includes('users_tenant_email_lower_key'),
    );
}

function userActionError(error: unknown, fallback: string): string {
    if (isTenantEmailConflict(error)) return 'A user with that email already exists.';
    return error instanceof Error ? error.message : fallback;
}

async function withUserMutationTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
    return runWithTenantContext(tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await operation(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function insertUserAuditLog(
    client: PoolClient,
    input: {
        tenantId: string;
        actorUserId: string;
        action: 'CREATE' | 'UPDATE';
        entityId: string;
        description: string;
        beforeState?: Record<string, unknown>;
        afterState?: Record<string, unknown>;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO audit_logs (
            tenant_id, user_id, action, entity_type, entity_id,
            description, before_state, after_state
         )
         VALUES ($1, $2, $3, 'users', $4, $5, $6::jsonb, $7::jsonb)`,
        [
            input.tenantId,
            input.actorUserId,
            input.action,
            input.entityId,
            input.description,
            JSON.stringify(input.beforeState ?? {}),
            JSON.stringify(input.afterState ?? {}),
        ],
    );
}

async function fetchManageableUserForUpdate(
    client: PoolClient,
    input: { tenantId: string; actorUserId: string; userId: string; manageableRoles: readonly string[] },
): Promise<UserMutationSnapshot> {
    const result = await client.query<UserMutationSnapshot>(
        `SELECT id, email, first_name, last_name, role, is_active
         FROM users
         WHERE id = $1
           AND tenant_id = $2
           AND id <> $3
           AND role = ANY($4::user_role[])
         LIMIT 1
         FOR UPDATE`,
        [input.userId, input.tenantId, input.actorUserId, [...input.manageableRoles]],
    );
    const row = result.rows[0];
    if (!row) throw new Error(cannotManageError());
    return row;
}

/** List users only from the caller's active tenant. */
export async function listUsers(): Promise<Result<UserManagementSnapshot>> {
    const auth = await requireUserAdmin();
    if (auth.ok === false) return { success: false, error: auth.error };

    try {
        const rows = await runWithTenantContext(auth.context.tenantId, async () => {
            const result = await pool.query<UserRow>(
                `SELECT ${SELECT_COLS}
                 FROM users
                 WHERE tenant_id = $1
                 ORDER BY created_at DESC
                 LIMIT 500`,
                [auth.context.tenantId],
            );
            return result.rows;
        });

        return {
            success: true,
            data: {
                users: rows.map((row) => mapRow(row, auth.context)),
                viewer: {
                    userId: auth.context.userId,
                    role: auth.context.role,
                },
                assignableRoles: [...getAssignableUserRoles(auth.context.role)],
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load users' };
    }
}

/** Create a lower-privilege user in the caller's active tenant. */
export async function createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password: string;
}): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (auth.ok === false) return { success: false, error: auth.error };

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: validationError(parsed.error) };

    const role = normalizeUserRole(parsed.data.role);
    if (!role) return { success: false, error: `Unsupported role: ${parsed.data.role}` };
    if (!canAssignUserRole(auth.context.role, role)) {
        return { success: false, error: 'You cannot create a user at or above your own privilege boundary.' };
    }

    try {
        const passwordHash = await hash(parsed.data.password, 12);
        const passwordExpiresAt = temporaryPasswordExpiresAt();
        const row = await withUserMutationTransaction(auth.context.tenantId, async (client) => {
            const existing = await client.query(
                `SELECT 1
                 FROM users
                 WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)
                 LIMIT 1`,
                [auth.context.tenantId, parsed.data.email],
            );
            if (existing.rowCount) throw new Error('A user with that email already exists.');

            const result = await client.query<UserRow>(
                `INSERT INTO users (
                    tenant_id, email, password_hash, first_name, last_name, role,
                    password_change_required, temporary_password_expires_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
                 RETURNING ${SELECT_COLS}`,
                [
                    auth.context.tenantId,
                    parsed.data.email,
                    passwordHash,
                    parsed.data.firstName,
                    parsed.data.lastName,
                    role,
                    passwordExpiresAt,
                ],
            );
            const created = result.rows[0];
            await insertUserAuditLog(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                action: 'CREATE',
                entityId: created.id,
                description: `Created user ${created.email} with a temporary credential.`,
                afterState: {
                    email: created.email,
                    role: created.role,
                    active: created.is_active,
                    passwordChangeRequired: true,
                    temporaryPasswordExpiresAt: passwordExpiresAt.toISOString(),
                },
            });
            return created;
        });

        return { success: true, data: mapRow(row, auth.context) };
    } catch (error) {
        return { success: false, error: userActionError(error, 'Failed to create user') };
    }
}

/** Update identity fields only. Role changes must use the approval-backed API. */
export async function updateUserProfile(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
}): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (auth.ok === false) return { success: false, error: auth.error };

    const parsed = updateUserProfileSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: validationError(parsed.error) };
    if (parsed.data.userId === auth.context.userId) {
        return { success: false, error: 'Use profile settings to edit your own account.' };
    }

    try {
        const row = await withUserMutationTransaction(auth.context.tenantId, async (client) => {
            const manageableRoles = [...getAssignableUserRoles(auth.context.role)];
            const before = await fetchManageableUserForUpdate(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                userId: parsed.data.userId,
                manageableRoles,
            });

            const existing = await client.query(
                `SELECT 1
                 FROM users
                 WHERE tenant_id = $1
                   AND LOWER(email) = LOWER($2)
                   AND id <> $3
                 LIMIT 1`,
                [auth.context.tenantId, parsed.data.email, parsed.data.userId],
            );
            if (existing.rowCount) throw new Error('A user with that email already exists.');

            const result = await client.query<UserRow>(
                `UPDATE users
                 SET email = $1,
                     first_name = $2,
                     last_name = $3,
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $4
                   AND tenant_id = $5
                   AND id <> $6
                   AND role = ANY($7::user_role[])
                 RETURNING ${SELECT_COLS}`,
                [
                    parsed.data.email,
                    parsed.data.firstName,
                    parsed.data.lastName,
                    parsed.data.userId,
                    auth.context.tenantId,
                    auth.context.userId,
                    manageableRoles,
                ],
            );
            if (!result.rows[0]) throw new Error(cannotManageError());
            const updated = result.rows[0];
            await insertUserAuditLog(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                action: 'UPDATE',
                entityId: updated.id,
                description: `Updated identity profile for ${updated.email}; existing sessions were revoked.`,
                beforeState: {
                    email: before.email,
                    firstName: before.first_name,
                    lastName: before.last_name,
                },
                afterState: {
                    email: updated.email,
                    firstName: updated.first_name,
                    lastName: updated.last_name,
                    sessionsRevoked: true,
                },
            });
            return updated;
        });

        return { success: true, data: mapRow(row, auth.context) };
    } catch (error) {
        return { success: false, error: userActionError(error, 'Failed to update user') };
    }
}

/** Activate/deactivate a lower-privilege user in the caller's active tenant. */
export async function setUserActive(userId: string, active: boolean): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (auth.ok === false) return { success: false, error: auth.error };

    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) return { success: false, error: validationError(parsedUserId.error) };
    if (typeof active !== 'boolean') return { success: false, error: 'Active status must be true or false.' };
    if (parsedUserId.data === auth.context.userId) {
        return { success: false, error: 'You cannot activate or deactivate your own account.' };
    }

    try {
        const row = await withUserMutationTransaction(auth.context.tenantId, async (client) => {
            const manageableRoles = [...getAssignableUserRoles(auth.context.role)];
            const before = await fetchManageableUserForUpdate(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                userId: parsedUserId.data,
                manageableRoles,
            });
            const result = await client.query<UserRow>(
                `UPDATE users
                 SET is_active = $1,
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $2
                   AND tenant_id = $3
                   AND role = ANY($4::user_role[])
                   AND id <> $5
                 RETURNING ${SELECT_COLS}`,
                [
                    active,
                    parsedUserId.data,
                    auth.context.tenantId,
                    manageableRoles,
                    auth.context.userId,
                ],
            );
            if (!result.rows[0]) throw new Error(cannotManageError());
            const updated = result.rows[0];
            await insertUserAuditLog(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                action: 'UPDATE',
                entityId: updated.id,
                description: `${active ? 'Activated' : 'Deactivated'} user ${updated.email}; existing sessions were revoked.`,
                beforeState: { active: before.is_active },
                afterState: { active: updated.is_active, sessionsRevoked: true },
            });
            return updated;
        });

        return { success: true, data: mapRow(row, auth.context) };
    } catch (error) {
        return { success: false, error: userActionError(error, 'Failed to update user') };
    }
}

/** Reset a lower-privilege user's password to a generated temporary value. */
export async function resetUserPassword(userId: string): Promise<Result<{ temporaryPassword: string }>> {
    const auth = await requireUserAdmin();
    if (auth.ok === false) return { success: false, error: auth.error };

    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) return { success: false, error: validationError(parsedUserId.error) };
    if (parsedUserId.data === auth.context.userId) {
        return { success: false, error: 'Use password settings to reset your own password.' };
    }

    try {
        const temporaryPassword = randomBytes(18).toString('base64url');
        const passwordHash = await hash(temporaryPassword, 12);
        const passwordExpiresAt = temporaryPasswordExpiresAt();
        const updated = await withUserMutationTransaction(auth.context.tenantId, async (client) => {
            const manageableRoles = [...getAssignableUserRoles(auth.context.role)];
            const before = await fetchManageableUserForUpdate(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                userId: parsedUserId.data,
                manageableRoles,
            });
            const result = await client.query<{ id: string; authVersion: number }>(
                `UPDATE users
                 SET password_hash = $1,
                     password_change_required = TRUE,
                     temporary_password_expires_at = $2,
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $3
                   AND tenant_id = $4
                   AND role = ANY($5::user_role[])
                   AND id <> $6
                 RETURNING id, auth_version AS "authVersion"`,
                [
                    passwordHash,
                    passwordExpiresAt,
                    parsedUserId.data,
                    auth.context.tenantId,
                    manageableRoles,
                    auth.context.userId,
                ],
            );
            const changed = result.rows[0];
            if (!changed) throw new Error(cannotManageError());
            await insertUserAuditLog(client, {
                tenantId: auth.context.tenantId,
                actorUserId: auth.context.userId,
                action: 'UPDATE',
                entityId: changed.id,
                description: `Issued an expiring temporary credential for ${before.email}; existing sessions were revoked.`,
                afterState: {
                    passwordChangeRequired: true,
                    temporaryPasswordExpiresAt: passwordExpiresAt.toISOString(),
                    sessionsRevoked: true,
                },
            });
            return true;
        });
        if (!updated) return { success: false, error: cannotManageError() };
        return { success: true, data: { temporaryPassword } };
    } catch (error) {
        return { success: false, error: userActionError(error, 'Failed to reset password') };
    }
}
