import { pool, runWithTenantContext } from '@/lib/db';
import type { SessionData } from './session-options';

type PersistedUserRow = {
    role: string;
    email: string;
    isActive: boolean;
    authVersion: number;
    passwordChangeRequired: boolean;
    temporaryPasswordExpiresAt: Date | string | null;
    tenantIsActive: boolean;
    companyId: string | null;
    companyIsActive: boolean | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistedSessionValidation =
    | {
        valid: true;
        role: string;
        email: string;
        passwordChangeRequired: boolean;
        temporaryPasswordExpiresAt?: string;
    }
    | {
        valid: false;
        reason: 'INVALID_IDENTITY' | 'MISSING_REVISION' | 'USER_REVOKED' | 'TEMPORARY_PASSWORD_EXPIRED';
    };

function toIso(value: Date | string | null): string | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Revalidates the signed cookie against tenant-scoped persisted identity state.
 *
 * The explicit `runWithTenantContext` is a security and recursion boundary: this
 * function can be reached from the DB request-context resolver itself, and the
 * contextual query must therefore never ask that resolver for another session.
 */
export async function validatePersistedSession(
    session: Pick<
        SessionData,
        'userId' | 'tenantId' | 'authVersion' | 'authProvider' | 'token' | 'impersonation'
    >,
): Promise<PersistedSessionValidation> {
    if (!UUID_RE.test(session.userId) || !UUID_RE.test(session.tenantId)) {
        return { valid: false, reason: 'INVALID_IDENTITY' };
    }
    if (!Number.isInteger(session.authVersion) || Number(session.authVersion) < 1) {
        return { valid: false, reason: 'MISSING_REVISION' };
    }

    const row = await runWithTenantContext(session.tenantId, async () => {
        const result = await pool.query<PersistedUserRow>(
            `SELECT
                u.role::text AS role,
                u.email,
                u.is_active AS "isActive",
                u.auth_version AS "authVersion",
                u.password_change_required AS "passwordChangeRequired",
                u.temporary_password_expires_at AS "temporaryPasswordExpiresAt",
                t.is_active AS "tenantIsActive",
                c.id::text AS "companyId",
                c.is_active AS "companyIsActive"
             FROM users u
             INNER JOIN tenants t ON t.id = u.tenant_id
             LEFT JOIN companies c ON c.id = t.company_id
             WHERE u.tenant_id = $1 AND u.id = $2
             LIMIT 1`,
            [session.tenantId, session.userId],
        );
        return result.rows[0];
    });

    if (
        !row
        || !row.isActive
        || !row.tenantIsActive
        || (row.companyId && !row.companyIsActive)
        || row.authVersion !== session.authVersion
    ) {
        return { valid: false, reason: 'USER_REVOKED' };
    }

    const isImpersonation = session.authProvider === 'impersonation'
        || Boolean(session.token?.startsWith('impersonating:'));
    if (isImpersonation) {
        const actor = session.impersonation;
        if (
            !actor
            || !UUID_RE.test(actor.actorUserId)
            || !UUID_RE.test(actor.actorTenantId)
            || !Number.isInteger(actor.actorAuthVersion)
            || actor.actorAuthVersion < 1
        ) {
            return { valid: false, reason: 'USER_REVOKED' };
        }

        const actorRow = await runWithTenantContext(actor.actorTenantId, async () => {
            const result = await pool.query<PersistedUserRow>(
                `SELECT
                    u.role::text AS role,
                    u.email,
                    u.is_active AS "isActive",
                    u.auth_version AS "authVersion",
                    u.password_change_required AS "passwordChangeRequired",
                    u.temporary_password_expires_at AS "temporaryPasswordExpiresAt",
                    t.is_active AS "tenantIsActive",
                    c.id::text AS "companyId",
                    c.is_active AS "companyIsActive"
                 FROM users u
                 INNER JOIN tenants t ON t.id = u.tenant_id
                 LEFT JOIN companies c ON c.id = t.company_id
                 WHERE u.tenant_id = $1 AND u.id = $2
                 LIMIT 1`,
                [actor.actorTenantId, actor.actorUserId],
            );
            return result.rows[0];
        });
        if (
            !actorRow
            || actorRow.role !== 'PLATFORM_ADMIN'
            || !actorRow.isActive
            || !actorRow.tenantIsActive
            || (actorRow.companyId && !actorRow.companyIsActive)
            || actorRow.authVersion !== actor.actorAuthVersion
        ) {
            return { valid: false, reason: 'USER_REVOKED' };
        }
    }

    const temporaryPasswordExpiresAt = toIso(row.temporaryPasswordExpiresAt);
    if (
        row.passwordChangeRequired
        && (!temporaryPasswordExpiresAt || Date.parse(temporaryPasswordExpiresAt) <= Date.now())
    ) {
        return { valid: false, reason: 'TEMPORARY_PASSWORD_EXPIRED' };
    }

    return {
        valid: true,
        role: row.role,
        email: row.email,
        passwordChangeRequired: row.passwordChangeRequired,
        temporaryPasswordExpiresAt,
    };
}
