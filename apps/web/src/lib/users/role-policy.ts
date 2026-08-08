import {
    AUTHORIZATION_ROLE_VALUES,
    isAuthorizationRole,
    type AuthorizationRole,
} from '@school-sis/api';

export const USER_MANAGER_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
] as const satisfies readonly AuthorizationRole[];

export type UserManagerRole = (typeof USER_MANAGER_ROLES)[number];

const PLATFORM_ADMIN_ASSIGNABLE_ROLES = AUTHORIZATION_ROLE_VALUES.filter(
    (role) => role !== 'PLATFORM_ADMIN',
);

const SUPER_ADMIN_ASSIGNABLE_ROLES = AUTHORIZATION_ROLE_VALUES.filter(
    (role) => role !== 'PLATFORM_ADMIN' && role !== 'SUPER_ADMIN',
);

const SCHOOL_ADMIN_ASSIGNABLE_ROLES = AUTHORIZATION_ROLE_VALUES.filter(
    (role) => !['PLATFORM_ADMIN', 'SUPER_ADMIN', 'GROUP_EXECUTIVE', 'SCHOOL_ADMIN'].includes(role),
);

const ASSIGNABLE_ROLES_BY_MANAGER = {
    PLATFORM_ADMIN: PLATFORM_ADMIN_ASSIGNABLE_ROLES,
    SUPER_ADMIN: SUPER_ADMIN_ASSIGNABLE_ROLES,
    SCHOOL_ADMIN: SCHOOL_ADMIN_ASSIGNABLE_ROLES,
} as const satisfies Record<UserManagerRole, readonly AuthorizationRole[]>;

export function isUserManagerRole(role: string): role is UserManagerRole {
    return (USER_MANAGER_ROLES as readonly string[]).includes(role);
}

export function normalizeUserRole(value: string): AuthorizationRole | null {
    const normalized = value.trim().toUpperCase();
    return isAuthorizationRole(normalized) ? normalized : null;
}

export function getAssignableUserRoles(actorRole: string): readonly AuthorizationRole[] {
    if (!isUserManagerRole(actorRole)) return [];
    return ASSIGNABLE_ROLES_BY_MANAGER[actorRole];
}

export function canAssignUserRole(actorRole: string, targetRole: string): boolean {
    const normalizedTarget = normalizeUserRole(targetRole);
    return Boolean(
        normalizedTarget
        && getAssignableUserRoles(actorRole).includes(normalizedTarget),
    );
}

/**
 * User-management mutations may only target roles that the actor could assign.
 * This keeps peer and higher-privilege accounts outside the actor's control.
 */
export function canManageUserRole(actorRole: string, targetRole: string): boolean {
    return canAssignUserRole(actorRole, targetRole);
}
