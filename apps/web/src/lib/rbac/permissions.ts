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

type Permission = string;

// Role-Permission Matrix
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    PLATFORM_ADMIN: ['*'], // platform-level superuser — all permissions across all tenants

    SUPER_ADMIN: ['*'], // tenant-level superuser — all permissions within their tenant

    GROUP_EXECUTIVE: [
        'reports:*',
        'hq:*',
        'policy:read'
    ],

    SCHOOL_ADMIN: [
        'fees:*',
        'admissions:*',
        'students:*',
        'staff:*',
        'timetable:*',
        'substitution:*',
        'transport:*',
        'settings:*',
        'reports:*',
        'audit:read',
        'hostel:read',
        'hostel:write',
        'diary:read',
        'diary:write',
        'appointments:read',
        'appointments:write',
        'library:read',
        'library:write',
        'gradebook:read',
        'gradebook:write',
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

    FINANCE_LEAD: [
        'fees:*',
        'invoices:*',
        'payments:*',
        'treasury:*',
        'reports:finance'
    ],

    REGISTRAR: [
        'students:*',
        'academic:*',
        'exams:*',
        'credentials:*',
        'transfer:*'
    ],

    STUDENT_SUCCESS_COUNSELOR: [
        'students:read',
        'welfare:*',
        'interventions:*'
    ],

    TRUST_OFFICER: [
        'audit:read',
        'procurement:*',
        'policy:*'
    ],

    CREDENTIAL_OFFICER: [
        'credentials:issue',
        'credentials:revoke',
        'credentials:read'
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
        'gradebook:read',
        'gradebook:write',
        'diary:read',
        'appointments:read',
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
        'parent:read',
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
        UserRole.PLATFORM_ADMIN,
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
        UserRole.PLATFORM_ADMIN,
        UserRole.SUPER_ADMIN,
        UserRole.GROUP_EXECUTIVE,
        UserRole.SCHOOL_ADMIN,
        UserRole.PRINCIPAL,
        UserRole.REGISTRAR,
        UserRole.FINANCE_LEAD,
        UserRole.ACCOUNTANT,
        UserRole.ADMISSION_COUNSELOR,
        UserRole.STUDENT_SUCCESS_COUNSELOR,
        UserRole.TEACHER,
        UserRole.TRANSPORT_MANAGER,
        UserRole.TRUST_OFFICER,
        UserRole.CREDENTIAL_OFFICER,
    ].includes(role);
}
