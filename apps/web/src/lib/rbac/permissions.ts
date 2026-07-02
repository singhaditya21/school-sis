import {
    getRolePermissionStrings,
    hasFineGrainedPermission,
    isAdminAuthorizationRole,
    isStaffAuthorizationRole,
} from '../../../../../packages/api/src/authorization';

// Local UserRole enum (backend uses Java, not Prisma)
export enum UserRole {
    PLATFORM_ADMIN = 'PLATFORM_ADMIN',
    SUPER_ADMIN = 'SUPER_ADMIN',
    GROUP_EXECUTIVE = 'GROUP_EXECUTIVE',
    SCHOOL_ADMIN = 'SCHOOL_ADMIN',
    PRINCIPAL = 'PRINCIPAL',
    REGISTRAR = 'REGISTRAR',
    FINANCE_LEAD = 'FINANCE_LEAD',
    ACCOUNTANT = 'ACCOUNTANT',
    ADMISSION_COUNSELOR = 'ADMISSION_COUNSELOR',
    STUDENT_SUCCESS_COUNSELOR = 'STUDENT_SUCCESS_COUNSELOR',
    TEACHER = 'TEACHER',
    TRANSPORT_MANAGER = 'TRANSPORT_MANAGER',
    TRUST_OFFICER = 'TRUST_OFFICER',
    CREDENTIAL_OFFICER = 'CREDENTIAL_OFFICER',
    PARENT = 'PARENT',
    STUDENT = 'STUDENT',
}

export type Permission = string;

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
    return hasFineGrainedPermission(role, permission);
}

export function getPermissionsForRole(role: UserRole): readonly Permission[] {
    return getRolePermissionStrings(role);
}

/**
 * Require specific permissions - throws error if not authorized
 */
export function requirePermission(role: UserRole, permission: Permission): void {
    if (!hasPermission(role, permission)) {
        throw new Error(`Unauthorized: ${role} does not have permission ${permission}`);
    }
}

/**
 * Check if  role is admin level
 */
export function isAdmin(role: UserRole): boolean {
    return isAdminAuthorizationRole(role);
}

/**
 * Check if role is staff
 */
export function isStaff(role: UserRole): boolean {
    return isStaffAuthorizationRole(role);
}
