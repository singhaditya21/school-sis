'use server';

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { sql, runWithTenantContext } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { isMfaEnrollmentEnforced } from '@/lib/auth/identity';
import { isRoleMfaRequired } from '@/lib/auth/session-options';
import { evictUserSessionCache, isSessionStateActive } from '@/lib/auth/session-revocation';
import { isPermanentPlatformAdminEmail } from '@/lib/auth/platform-owner';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';
import { encryptEmail, encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { enqueueNotification } from '@/lib/notifications/outbox';
import {
    WorkflowAdoptionExecutionError,
    changeUserRoleWithApproval,
} from '@/lib/workflows/adoption-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export interface AdminUser {
    id: string;
    tenantId: string | null;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    customRoleId?: string | null;
    customRoleName?: string | null;
    customRoleCode?: string | null;
    active: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
}

type Result<T> = {
    success: boolean;
    data?: T;
    error?: string;
    approvalRequired?: boolean;
    approvalRequestId?: string;
};

const USER_ADMIN_ROLES = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SCHOOL_ADMIN'];
const TENANT_ASSIGNABLE_ROLES = new Set([
    'SUPER_ADMIN',
    'GROUP_EXECUTIVE',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'REGISTRAR',
    'FINANCE_LEAD',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'STUDENT_SUCCESS_COUNSELOR',
    'TEACHER',
    'TRANSPORT_MANAGER',
    'TRUST_OFFICER',
    'CREDENTIAL_OFFICER',
    'PARENT',
    'STUDENT',
]);

function validateAssignableRole(
    actorRole: string,
    requestedRole: string,
    options?: { isCreation?: boolean },
): string | null {
    if (!TENANT_ASSIGNABLE_ROLES.has(requestedRole)) {
        return 'Invalid or forbidden user role.';
    }
    if (requestedRole === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN' && actorRole !== 'PLATFORM_ADMIN') {
        return 'Only a SUPER_ADMIN may assign the SUPER_ADMIN role.';
    }
    if (
        (requestedRole === 'SCHOOL_ADMIN' || requestedRole === 'GROUP_EXECUTIVE') &&
        actorRole !== 'SUPER_ADMIN' &&
        actorRole !== 'PLATFORM_ADMIN'
    ) {
        return 'Only a SUPER_ADMIN or PLATFORM_ADMIN may assign administrative leadership roles.';
    }
    if (
        options?.isCreation &&
        requestedRole === 'FINANCE_LEAD' &&
        actorRole !== 'SUPER_ADMIN' &&
        actorRole !== 'PLATFORM_ADMIN'
    ) {
        return 'Only a SUPER_ADMIN or PLATFORM_ADMIN may directly create a FINANCE_LEAD account.';
    }
    return null;
}

function canManageExistingRole(actorRole: string, targetRole: string): boolean {
    if (targetRole === 'PLATFORM_ADMIN') return false;
    if (targetRole === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN' && actorRole !== 'PLATFORM_ADMIN') {
        return false;
    }
    if (
        (targetRole === 'SCHOOL_ADMIN' || targetRole === 'GROUP_EXECUTIVE') &&
        actorRole !== 'SUPER_ADMIN' &&
        actorRole !== 'PLATFORM_ADMIN'
    ) {
        return false;
    }
    return true;
}

async function requireUserAdmin() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.tenantId || !session.userId) {
        return { ok: false as const, error: 'Not authenticated' };
    }
    if (!(await isSessionStateActive(session))) {
        return { ok: false as const, error: 'Not authenticated' };
    }
    const roleRequiresMfa = isRoleMfaRequired(session.role, {
        isDemoSandbox: session.isDemoSandbox,
        tenantCode: session.tenantCode,
    });
    if (
        !isDemoSession(session) &&
        (Boolean(session.mfaRequired) || (isMfaEnrollmentEnforced() && roleRequiresMfa)) &&
        !session.mfaVerified
    ) {
        return { ok: false as const, error: 'Two-factor authentication setup is required.' };
    }
    if (!USER_ADMIN_ROLES.includes(session.role)) {
        return { ok: false as const, error: 'You do not have permission to manage users.' };
    }
    return {
        ok: true as const,
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
        isDemoSandbox: isDemoSession(session),
    };
}

type UserRow = {
    id: string;
    tenant_id: string | null;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    custom_role_id?: string | null;
    custom_role_name?: string | null;
    custom_role_code?: string | null;
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
        customRoleId: r.custom_role_id ?? null,
        customRoleName: r.custom_role_name ?? null,
        customRoleCode: r.custom_role_code ?? null,
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
                SELECT u.id,
                       u.tenant_id,
                       COALESCE(u.email_enc, u.email) AS email,
                       u.first_name,
                       u.last_name,
                       u.role,
                       u.custom_role_id,
                       tr.name AS custom_role_name,
                       tr.code AS custom_role_code,
                       u.is_active,
                       u.created_at,
                       u.last_login_at
                FROM users u
                LEFT JOIN tenant_roles tr
                       ON tr.id = u.custom_role_id
                      AND tr.tenant_id = u.tenant_id
                WHERE u.tenant_id = ${auth.tenantId}
                ORDER BY u.created_at DESC
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
    if (isPermanentPlatformAdminEmail(email)) {
        return { success: false, error: 'This email is reserved for ScholarMind Platform Administration.' };
    }
    if (!input.password || input.password.length < 12) {
        return { success: false, error: 'Password must be at least 12 characters.' };
    }
    const roleError = validateAssignableRole(auth.role, input.role, { isCreation: true });
    if (roleError) return { success: false, error: roleError };

    try {
        const passwordHash = await hash(input.password, 12);
        const row = await runWithTenantContext(auth.tenantId, async () => {
            const existingCount = await sql`
                SELECT 1 FROM users WHERE tenant_id = ${auth.tenantId} AND (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR email = ${email})
            `.execute();
            if (existingCount) throw new Error('A user with that email already exists.');
            const rows = await sql<UserRow>`
                INSERT INTO users (tenant_id, email_enc, password_hash, first_name, last_name, role)
                VALUES (${auth.tenantId}, ${encryptEmail(email)}, ${passwordHash}, ${input.firstName ?? ''}, ${input.lastName ?? ''}, ${input.role}::user_role)
                RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
            `;
            const created = rows[0];
            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                VALUES (${auth.tenantId}, ${auth.userId}, 'CREATE', 'user', ${created.id}, ${`Created user with role ${created.role}`})
            `.execute();
            return created;
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
    reason?: string;
    approvalRequestId?: string;
}): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const email = input.email?.trim().toLowerCase();
    if (!email) return { success: false, error: 'Email is required.' };
    if (isPermanentPlatformAdminEmail(email)) {
        return { success: false, error: 'This email is reserved for ScholarMind Platform Administration.' };
    }
    if (!input.firstName?.trim()) return { success: false, error: 'First name is required.' };
    const roleError = validateAssignableRole(auth.role, input.role);
    if (roleError) return { success: false, error: roleError };

    if (auth.isDemoSandbox || (await isDemoTenantId(auth.tenantId))) {
        return {
            success: false,
            error: 'Shared demo sandbox accounts cannot be modified.',
        };
    }

    try {
        const updateOutcome = await runWithTenantContext(auth.tenantId, async () => {
            const currentRows = await sql<{ role: string; email: string | null }>`
                SELECT role, COALESCE(email_enc, email) AS email
                FROM users
                WHERE id = ${input.userId} AND tenant_id = ${auth.tenantId}
                LIMIT 1
            `.rows();
            if (!currentRows[0]) throw new Error('User not found.');
            const currentRole = currentRows[0].role;

            if (isPermanentPlatformAdminEmail(decryptFieldTolerant(currentRows[0].email))) {
                throw new Error('The permanent Platform Administrator account cannot be modified from tenant user management.');
            }
            if (input.userId === auth.userId && currentRole !== input.role) {
                throw new Error('You cannot modify your own role.');
            }
            if (!canManageExistingRole(auth.role, currentRole)) {
                throw new Error('Insufficient privileges to modify this user account.');
            }

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

            const roleChanged = currentRole !== input.role;
            if (roleChanged && auth.role === 'PLATFORM_ADMIN') {
                const updatedRows = await sql<UserRow>`
                    UPDATE users
                    SET email = NULL,
                        email_enc = ${encryptEmail(email)},
                        first_name = ${input.firstName.trim()},
                        last_name = ${(input.lastName ?? '').trim()},
                        role = ${input.role}::user_role,
                        session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE id = ${input.userId} AND tenant_id = ${auth.tenantId}
                    RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
                `.rows();
                if (!updatedRows[0]) throw new Error('User not found.');
                await sql`
                    INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                    VALUES (${auth.tenantId}, ${auth.userId}, 'UPDATE', 'user', ${input.userId}, ${`Updated user profile/role (${currentRole} -> ${input.role})`})
                `.execute();
                return { row: updatedRows[0], roleChangedDirectly: true, requestRoleApproval: false };
            }

            // Update profile fields only; non-PLATFORM_ADMIN role mutations must go through
            // `changeUserRoleWithApproval` (`users.role_change` 4-eyes approval policy).
            const updatedRows = await sql<UserRow>`
                UPDATE users
                SET email = NULL,
                    email_enc = ${encryptEmail(email)},
                    first_name = ${input.firstName.trim()},
                    last_name = ${(input.lastName ?? '').trim()},
                    updated_at = NOW()
                WHERE id = ${input.userId} AND tenant_id = ${auth.tenantId}
                RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
            `.rows();
            if (!updatedRows[0]) throw new Error('User not found.');
            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                VALUES (${auth.tenantId}, ${auth.userId}, 'UPDATE', 'user', ${input.userId}, 'Updated user profile details')
            `.execute();
            return {
                row: updatedRows[0],
                roleChangedDirectly: false,
                requestRoleApproval: roleChanged,
                currentRole,
            };
        });

        if (updateOutcome.roleChangedDirectly) {
            evictUserSessionCache(auth.tenantId, input.userId);
            return { success: true, data: mapRow(updateOutcome.row) };
        }

        if (updateOutcome.requestRoleApproval) {
            const roleApproval = await changeUserRoleWithApproval({
                tenantId: auth.tenantId,
                userId: input.userId,
                targetRole: input.role,
                reason:
                    input.reason?.trim() ||
                    `Administrative role change request (${updateOutcome.currentRole} -> ${input.role})`,
                approvalRequestId: input.approvalRequestId,
                actor: {
                    userId: auth.userId,
                    role: auth.role as AuthorizationRole,
                    tenantId: auth.tenantId,
                },
            });

            if (roleApproval.status === 'APPROVAL_REQUIRED') {
                return {
                    success: true,
                    approvalRequired: true,
                    approvalRequestId: roleApproval.approval.id,
                    data: mapRow(updateOutcome.row),
                };
            }

            await runWithTenantContext(auth.tenantId, async () => {
                await sql`
                    UPDATE users
                    SET session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE id = ${input.userId} AND tenant_id = ${auth.tenantId}
                `.execute();
            });
            evictUserSessionCache(auth.tenantId, input.userId);
            return {
                success: true,
                approvalRequired: false,
                approvalRequestId: roleApproval.approvalRequestId,
                data: {
                    ...mapRow(updateOutcome.row),
                    role: input.role,
                },
            };
        }

        return { success: true, data: mapRow(updateOutcome.row) };
    } catch (e) {
        if (e instanceof WorkflowAdoptionExecutionError || e instanceof WorkflowApprovalError) {
            return { success: false, error: e.message };
        }
        return { success: false, error: e instanceof Error ? e.message : 'Failed to update user' };
    }
}

/** Activate/deactivate a user in the caller's tenant. */
export async function setUserActive(userId: string, active: boolean): Promise<Result<AdminUser>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!active && userId === auth.userId) {
        return { success: false, error: 'You cannot deactivate your own account.' };
    }
    if (auth.isDemoSandbox || (await isDemoTenantId(auth.tenantId))) {
        return {
            success: false,
            error: 'Shared demo sandbox accounts cannot be deactivated or modified.',
        };
    }
    try {
        const row = await runWithTenantContext(auth.tenantId, async () => {
            const currentRows = await sql<{ role: string; email: string | null }>`
                SELECT role, COALESCE(email_enc, email) AS email
                FROM users
                WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
                LIMIT 1
            `.rows();
            if (!currentRows[0]) throw new Error('User not found.');
            if (isPermanentPlatformAdminEmail(decryptFieldTolerant(currentRows[0].email))) {
                throw new Error('The permanent Platform Administrator account cannot be modified from tenant user management.');
            }
            if (!canManageExistingRole(auth.role, currentRows[0].role)) {
                throw new Error('Insufficient privileges to modify this user account.');
            }

            const rows = active
                ? await sql<UserRow>`
                      UPDATE users
                      SET is_active = ${true}, updated_at = NOW()
                      WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
                      RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
                  `
                : await sql<UserRow>`
                      UPDATE users
                      SET is_active = ${false},
                          session_version = session_version + 1,
                          updated_at = NOW()
                      WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
                      RETURNING id, tenant_id, COALESCE(email_enc, email) AS email, first_name, last_name, role, is_active, created_at, last_login_at
                  `;
            if (!rows[0]) throw new Error('User not found.');
            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                VALUES (${auth.tenantId}, ${auth.userId}, 'UPDATE', 'user', ${userId}, ${active ? 'Activated user account' : 'Deactivated user account'})
            `.execute();
            return rows[0];
        });
        evictUserSessionCache(auth.tenantId, userId);
        return { success: true, data: mapRow(row) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to update user' };
    }
}

/** Reset a user's password to a generated temporary one, returned once. */
export async function resetUserPassword(userId: string): Promise<Result<{ temporaryPassword: string }>> {
    const auth = await requireUserAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (auth.isDemoSandbox || (await isDemoTenantId(auth.tenantId))) {
        return {
            success: false,
            error: 'Password resets are disabled for shared demo sandbox accounts.',
        };
    }
    try {
        const temporaryPassword = randomBytes(12).toString('base64url');
        const passwordHash = await hash(temporaryPassword, 12);
        const resetResult = await runWithTenantContext(auth.tenantId, async () => {
            const currentRows = await sql<{ role: string; email: string | null }>`
                SELECT role, COALESCE(email_enc, email) AS email
                FROM users
                WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
                LIMIT 1
            `.rows();
            if (!currentRows[0]) return { updated: false as const, email: '' };
            const decryptedEmail = decryptFieldTolerant(currentRows[0].email);
            if (isPermanentPlatformAdminEmail(decryptedEmail)) {
                throw new Error('The permanent Platform Administrator account cannot be modified from tenant user management.');
            }
            if (!canManageExistingRole(auth.role, currentRows[0].role)) {
                throw new Error('Insufficient privileges to reset password for this user account.');
            }

            const rowCount = await sql`
                UPDATE users
                SET password_hash = ${passwordHash},
                    session_version = session_version + 1,
                    updated_at = NOW()
                WHERE id = ${userId} AND tenant_id = ${auth.tenantId}
            `.execute();
            if (rowCount > 0) {
                await sql`
                    INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                    VALUES (${auth.tenantId}, ${auth.userId}, 'UPDATE', 'user', ${userId}, 'Reset user credentials and invalidated active sessions')
                `.execute();
            }
            return { updated: rowCount > 0, email: decryptedEmail };
        });
        if (!resetResult.updated) return { success: false, error: 'User not found.' };

        evictUserSessionCache(auth.tenantId, userId);

        if (resetResult.email && resetResult.email.includes('@')) {
            try {
                await enqueueNotification({
                    tenantId: auth.tenantId,
                    channel: 'EMAIL',
                    recipient: resetResult.email,
                    recipientUserId: userId,
                    subject: 'Security Notice: Your ScholarMind password was reset',
                    body: 'An administrator reset your ScholarMind workspace password and signed out all active sessions. If you did not expect this change, contact your institution administrator immediately.',
                    payload: {
                        eventType: 'USER_PASSWORD_RESET',
                        targetUserId: userId,
                        actorUserId: auth.userId,
                    },
                    createdBy: auth.userId,
                });
            } catch {
                // Notification delivery is best-effort when an email provider is not configured.
            }
        }

        return { success: true, data: { temporaryPassword } };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to reset password' };
    }
}
