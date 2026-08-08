'use server';

import { compare, hash } from 'bcryptjs';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getPasswordChangeSession } from '@/lib/auth/session';
import { pool, runWithTenantContext } from '@/lib/db';

type ChangePasswordResult = {
    success: boolean;
    error?: string;
    redirectTo?: string;
};

type TemporaryCredentialRow = {
    id: string;
    email: string;
    role: string;
    passwordHash: string;
    authVersion: number;
    isActive: boolean;
    passwordChangeRequired: boolean;
    temporaryPasswordExpiresAt: Date | string | null;
};

const changeTemporaryPasswordSchema = z.object({
    currentPassword: z.string().min(8, 'Enter your current temporary password.').max(128),
    newPassword: z.string().min(12, 'New password must be at least 12 characters.').max(128),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
}).strict().superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['confirmPassword'],
            message: 'New password and confirmation do not match.',
        });
    }
    if (value.newPassword === value.currentPassword) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['newPassword'],
            message: 'Choose a password different from the temporary password.',
        });
    }
});

function redirectForRole(role: string): string {
    if (role === 'PLATFORM_ADMIN') return '/hq';
    if (role === 'PARENT') return '/overview';
    if (role === 'STUDENT') return '/profile';
    return '/dashboard';
}

async function changePasswordInTransaction(
    client: PoolClient,
    input: {
        tenantId: string;
        userId: string;
        authVersion: number;
        currentPassword: string;
        newPassword: string;
    },
): Promise<{ authVersion: number; role: string; email: string }> {
    const result = await client.query<TemporaryCredentialRow>(
        `SELECT
            id,
            email,
            role::text AS role,
            password_hash AS "passwordHash",
            auth_version AS "authVersion",
            is_active AS "isActive",
            password_change_required AS "passwordChangeRequired",
            temporary_password_expires_at AS "temporaryPasswordExpiresAt"
         FROM users
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [input.tenantId, input.userId],
    );
    const user = result.rows[0];
    if (
        !user
        || !user.isActive
        || !user.passwordChangeRequired
        || user.authVersion !== input.authVersion
    ) {
        throw new Error('The temporary credential is no longer valid. Sign in again.');
    }

    const expiry = user.temporaryPasswordExpiresAt
        ? new Date(user.temporaryPasswordExpiresAt).getTime()
        : Number.NaN;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
        throw new Error('Your temporary password has expired. Ask an administrator to reset it again.');
    }

    if (!await compare(input.currentPassword, user.passwordHash)) {
        throw new Error('The current temporary password is incorrect.');
    }

    const passwordHash = await hash(input.newPassword, 12);
    const updated = await client.query<{ authVersion: number }>(
        `UPDATE users
         SET password_hash = $1,
             password_change_required = FALSE,
             temporary_password_expires_at = NULL,
             auth_version = auth_version + 1,
             updated_at = NOW()
         WHERE tenant_id = $2
           AND id = $3
           AND auth_version = $4
           AND password_change_required = TRUE
         RETURNING auth_version AS "authVersion"`,
        [passwordHash, input.tenantId, input.userId, input.authVersion],
    );
    const changed = updated.rows[0];
    if (!changed) throw new Error('The temporary credential changed concurrently. Sign in again.');

    await client.query(
        `INSERT INTO audit_logs (
            tenant_id, user_id, action, entity_type, entity_id,
            description, before_state, after_state
         )
         VALUES ($1, $2, 'UPDATE', 'users', $2, $3, $4::jsonb, $5::jsonb)`,
        [
            input.tenantId,
            input.userId,
            'Replaced an expiring temporary credential and revoked all other sessions.',
            JSON.stringify({ passwordChangeRequired: true }),
            JSON.stringify({ passwordChangeRequired: false, sessionsRevoked: true }),
        ],
    );

    return { authVersion: changed.authVersion, role: user.role, email: user.email };
}

/** Replace an administrator-issued temporary credential before normal access is granted. */
export async function changeTemporaryPassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}): Promise<ChangePasswordResult> {
    const parsed = changeTemporaryPasswordSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.errors[0]?.message || 'Invalid password change.' };
    }

    const session = await getPasswordChangeSession();
    if (
        !session.isLoggedIn
        || !session.userId
        || !session.tenantId
        || !session.passwordChangeRequired
        || !Number.isInteger(session.authVersion)
    ) {
        return { success: false, error: 'A valid temporary-password session is required.' };
    }

    try {
        const changed = await runWithTenantContext(session.tenantId, async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await changePasswordInTransaction(client, {
                    tenantId: session.tenantId,
                    userId: session.userId,
                    authVersion: session.authVersion!,
                    currentPassword: parsed.data.currentPassword,
                    newPassword: parsed.data.newPassword,
                });
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        });

        // Every other cookie still carries the old revision. This one is the
        // sole session promoted to the new revision after the transaction.
        session.authVersion = changed.authVersion;
        session.role = changed.role;
        session.email = changed.email;
        session.passwordChangeRequired = false;
        session.temporaryPasswordExpiresAt = undefined;
        await session.save();

        return {
            success: true,
            redirectTo: session.mfaRequired && !session.mfaVerified
                ? '/mfa/enroll'
                : redirectForRole(changed.role),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to change temporary password.',
        };
    }
}
