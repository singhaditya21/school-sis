import { UserRole } from '@prisma/client';

type Permission = string;

// Role-Permission Matrix
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    SUPER_ADMIN: ['*'], // all permissions

    SCHOOL_ADMIN: [
        'fees:*',
        'admissions:*',
        'students:*',
        'staff:*',
        'timetable:*',
        'transport:*',
        'settings:*',
        'reports:*',
        'audit:read',
    ],

    PRINCIPAL: [
        'fees:read',
        'admissions:read',
        'students:read',
        'staff:read',
        'timetable:read',
        'transport:read',
        'reports:*',
        'audit:read',
    ],

    ACCOUNTANT: [
        'fees:*',
        'invoices:*',
        'payments:*',
        'receipts:*',
        'concessions:*',
        'reports:fees',
        'students:read',
    ],

    ADMISSION_COUNSELOR: [
        'admissions:*',
        'leads:*',
        'applications:*',
        'students:read',
    ],

    TEACHER: [
        'timetable:read',
        'attendance:*',
        'students:read',
        'substitution:read',
    ],

    TRANSPORT_MANAGER: [
        'transport:*',
        'routes:*',
        'vehicles:*',
        'students:read',
    ],

    PARENT: [
        'fees:read:own',
        'invoices:read:own',
        'payments:create:own',
        'receipts:read:own',
        'transport:read:own',
        'student:read:own',
    ],

    STUDENT: [
        'profile:read:own',
        'timetable:read:own',
    ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
    const rolePermissions = ROLE_PERMISSIONS[role] || [];

    // Check for wildcard permission
    if (rolePermissions.includes('*')) {
        return true;
    }

    // Check exact match
    if (rolePermissions.includes(permission)) {
        return true;
    }

    // Check for resource wildcard (e.g., fees:*)
    const [resource] = permission.split(':');
    if (rolePermissions.includes(`${resource}:*`)) {
        return true;
    }

    return false;
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
    return [
        UserRole.SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.PRINCIPAL,
    ].includes(role);
}

/**
 * Check if role is staff
 */
export function isStaff(role: UserRole): boolean {
    return [
        UserRole.SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.PRINCIPAL,
        UserRole.ACCOUNTANT,
        UserRole.ADMISSION_COUNSELOR,
        UserRole.TEACHER,
        UserRole.TRANSPORT_MANAGER,
    ].includes(role);
}
