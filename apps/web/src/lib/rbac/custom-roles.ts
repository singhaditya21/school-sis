import { runWithTenantContext, sql } from '@/lib/db';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

export interface EffectiveUserRoleContext {
    baseRole: string;
    effectiveRoleCode: string;
    customRoleId: string | null;
    customRoleName: string | null;
    /** Non-null when the user is assigned an active tenant custom role. */
    customPermissions: string[] | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RESERVED_SYSTEM_ROLE_CODES: ReadonlySet<string> = new Set(Object.values(UserRole));

/**
 * Pure permission matcher supporting exact grants (`students:read`),
 * resource wildcards (`students:*`, `object:student:*`), and tenant wildcard (`*`),
 * while strictly blocking `platform:*` escalation from tenant custom roles.
 */
export function matchCustomPermissionGrant(
    grants: readonly string[],
    requestedPermission: string,
): boolean {
    const normalizedReq = requestedPermission.trim().toLowerCase();
    if (!normalizedReq) return false;
    if (normalizedReq.startsWith('platform:')) {
        return false;
    }

    const parts = normalizedReq.split(':');
    const reqResource = parts[0] || '';
    const reqAction = parts[1] || '';
    const reqSubAction = parts[2] || '';

    for (const rawGrant of grants) {
        const g = rawGrant.trim().toLowerCase();
        if (!g || g.startsWith('platform:')) continue;
        if (g === '*') return true;
        if (g === normalizedReq) return true;

        const gParts = g.split(':');
        if (gParts.length === 2 && gParts[0] === reqResource && gParts[1] === '*') {
            return true;
        }
        if (gParts.length === 3 && parts.length === 3) {
            const resMatch = gParts[0] === reqResource;
            const objMatch = gParts[1] === '*' || gParts[1] === reqAction;
            const actMatch = gParts[2] === '*' || gParts[2] === reqSubAction;
            if (resMatch && objMatch && actMatch) return true;
        }
    }

    // Baseline self-navigation read access for authenticated staff custom roles
    if (normalizedReq === 'dashboard:read' || normalizedReq === 'notifications:read') {
        return true;
    }

    return false;
}

export function evaluateEffectivePermission(
    ctx: EffectiveUserRoleContext,
    permission: string,
): boolean {
    if (ctx.baseRole === 'PLATFORM_ADMIN') {
        return true;
    }
    if (permission.trim().toLowerCase().startsWith('platform:')) {
        return false;
    }
    if (ctx.baseRole === 'SUPER_ADMIN') {
        return true;
    }
    if (ctx.customRoleId && ctx.customPermissions !== null) {
        return matchCustomPermissionGrant(ctx.customPermissions, permission);
    }
    return hasPermission(ctx.baseRole as UserRole, permission);
}

export function canAccessObjectCrud(
    ctx: EffectiveUserRoleContext,
    objectApiName: string,
    action: 'read' | 'create' | 'update' | 'delete' | 'export',
): boolean {
    if (ctx.baseRole === 'PLATFORM_ADMIN' || ctx.baseRole === 'SUPER_ADMIN' || ctx.baseRole === 'SCHOOL_ADMIN') {
        if (!ctx.customRoleId) return true;
    }
    const cleanObj = objectApiName.trim().toLowerCase();
    if (ctx.customRoleId && ctx.customPermissions !== null) {
        if (matchCustomPermissionGrant(ctx.customPermissions, `object:${cleanObj}:${action}`)) {
            return true;
        }
        if (action === 'read' && matchCustomPermissionGrant(ctx.customPermissions, 'metadata:read')) {
            return true;
        }
        if (matchCustomPermissionGrant(ctx.customPermissions, 'metadata:publish')) {
            return true;
        }
        return false;
    }

    if (action === 'export') {
        return hasPermission(ctx.baseRole as UserRole, 'reports:export');
    }
    return ctx.baseRole !== 'PARENT' && ctx.baseRole !== 'STUDENT';
}

/**
 * Resolves a user's assigned custom role (`users.custom_role_id`) and permission grants
 * under tenant RLS context, falling back cleanly to `baseRole` if unassigned or in mock tests.
 */
export async function resolveEffectiveUserRoleContext(
    userId: string,
    tenantId: string,
    baseRole: string,
): Promise<EffectiveUserRoleContext> {
    const fallback: EffectiveUserRoleContext = {
        baseRole,
        effectiveRoleCode: baseRole,
        customRoleId: null,
        customRoleName: null,
        customPermissions: null,
    };

    if (!UUID_RE.test(userId) || !UUID_RE.test(tenantId)) {
        return fallback;
    }
    if (baseRole === 'PLATFORM_ADMIN' || baseRole === 'SUPER_ADMIN') {
        return fallback;
    }

    try {
        const rows = await runWithTenantContext(tenantId, async () =>
            sql<{
                custom_role_id: string | null;
                role_code: string | null;
                role_name: string | null;
                permissions: string[];
            }>`
                SELECT u.custom_role_id,
                       tr.code AS role_code,
                       tr.name AS role_name,
                       COALESCE(
                           jsonb_agg(trp.permission) FILTER (WHERE trp.permission IS NOT NULL),
                           '[]'::jsonb
                       ) AS permissions
                FROM users u
                LEFT JOIN tenant_roles tr
                       ON tr.id = u.custom_role_id
                      AND tr.tenant_id = u.tenant_id
                      AND tr.is_active = true
                LEFT JOIN tenant_role_permissions trp
                       ON trp.role_id = tr.id
                      AND trp.tenant_id = u.tenant_id
                WHERE u.id = ${userId}
                  AND u.tenant_id = ${tenantId}
                GROUP BY u.custom_role_id, tr.code, tr.name
                LIMIT 1
            `,
        );

        if (rows.length === 0 || !rows[0].custom_role_id || !rows[0].role_code) {
            return fallback;
        }

        return {
            baseRole,
            effectiveRoleCode: rows[0].role_code,
            customRoleId: rows[0].custom_role_id,
            customRoleName: rows[0].role_name,
            customPermissions: Array.isArray(rows[0].permissions)
                ? rows[0].permissions.map(String)
                : [],
        };
    } catch {
        return fallback;
    }
}
