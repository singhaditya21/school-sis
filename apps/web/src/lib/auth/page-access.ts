export type PageAccessLevel = 'public' | 'authenticated' | 'role';

export type PageAccessPolicy = {
    name: string;
    prefixes: readonly string[];
    level: PageAccessLevel;
    allowedRoles?: readonly string[];
};

export const PLATFORM_PAGE_ROLES = ['PLATFORM_ADMIN'] as const;

export const TENANT_STAFF_PAGE_ROLES = [
    'PLATFORM_ADMIN',
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
] as const;

export const TEACHER_PAGE_ROLES = ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'TEACHER'] as const;
export const PARENT_PAGE_ROLES = ['PARENT'] as const;
export const STUDENT_PAGE_ROLES = ['STUDENT'] as const;
export const OPERATOR_PAGE_ROLES = ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'] as const;

export const PUBLIC_PAGE_PREFIXES = ['/', '/login', '/register', '/setup'] as const;

const ADMIN_PAGE_PREFIXES = [
    '/admissions',
    '/alumni',
    '/analytics',
    '/api-docs',
    '/app',
    '/appointments',
    '/approvals',
    '/attendance',
    '/audit',
    '/audit-trail',
    '/automation',
    '/calendar',
    '/certificates',
    '/chat',
    '/coaching',
    '/compliance',
    '/consent',
    '/credentials',
    '/dashboard',
    '/diary',
    '/digilocker',
    '/documents',
    '/exams',
    '/fees',
    '/health',
    '/homework',
    '/hostel',
    '/hq-overview',
    '/hq-policies',
    '/id-cards',
    '/integrations',
    '/international',
    '/inventory',
    '/lesson-plans',
    '/library',
    '/marketplace',
    '/messages',
    '/onboarding',
    '/procurement',
    '/quiz',
    '/receipts',
    '/reports',
    '/schools',
    '/settings',
    '/timetable',
    '/transport',
    '/treasury',
    '/university',
    '/visitors',
] as const;

const DASHBOARD_PAGE_PREFIXES = ['/appexchange', '/data', '/executive', '/students'] as const;
const PARENT_PAGE_PREFIXES = [
    '/alerts',
    '/my-attendance',
    '/my-fees',
    '/my-results',
    '/my-transport',
    '/overview',
    '/parent-consent',
] as const;

export const PAGE_ACCESS_POLICIES = [
    {
        name: 'public',
        prefixes: PUBLIC_PAGE_PREFIXES,
        level: 'public',
    },
    {
        name: 'platform',
        prefixes: ['/platform', '/hq'],
        level: 'role',
        allowedRoles: PLATFORM_PAGE_ROLES,
    },
    {
        name: 'tenant-staff-dashboard',
        prefixes: DASHBOARD_PAGE_PREFIXES,
        level: 'role',
        allowedRoles: TENANT_STAFF_PAGE_ROLES,
    },
    {
        name: 'tenant-staff-admin',
        prefixes: ADMIN_PAGE_PREFIXES,
        level: 'role',
        allowedRoles: TENANT_STAFF_PAGE_ROLES,
    },
    {
        name: 'teacher',
        prefixes: ['/teacher'],
        level: 'role',
        allowedRoles: TEACHER_PAGE_ROLES,
    },
    {
        name: 'parent',
        prefixes: PARENT_PAGE_PREFIXES,
        level: 'role',
        allowedRoles: PARENT_PAGE_ROLES,
    },
    {
        name: 'student',
        prefixes: ['/student'],
        level: 'role',
        allowedRoles: STUDENT_PAGE_ROLES,
    },
    {
        name: 'operator',
        prefixes: ['/operator'],
        level: 'role',
        allowedRoles: OPERATOR_PAGE_ROLES,
    },
    {
        name: 'authenticated-support',
        prefixes: ['/unauthorized', '/upgrade'],
        level: 'authenticated',
    },
] as const satisfies readonly PageAccessPolicy[];

const AUTHENTICATED_FALLBACK_POLICY: PageAccessPolicy = {
    name: 'authenticated-fallback',
    prefixes: [],
    level: 'authenticated',
};

export function normalizePagePath(pathname: string): string {
    const path = pathname.split('?')[0]?.split('#')[0] || '/';
    if (path.length > 1 && path.endsWith('/')) {
        return path.slice(0, -1);
    }
    return path || '/';
}

export function pagePathMatchesPrefix(pathname: string, prefix: string): boolean {
    const normalizedPath = normalizePagePath(pathname);
    const normalizedPrefix = normalizePagePath(prefix);
    return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function findPageAccessPolicy(pathname: string): PageAccessPolicy | null {
    const matches = PAGE_ACCESS_POLICIES
        .flatMap((policy) => policy.prefixes.map((prefix) => ({ policy, prefix })))
        .filter(({ prefix }) => pagePathMatchesPrefix(pathname, prefix))
        .sort((left, right) => normalizePagePath(right.prefix).length - normalizePagePath(left.prefix).length);

    return matches[0]?.policy ?? null;
}

export function getPageAccessPolicy(pathname: string): PageAccessPolicy {
    return findPageAccessPolicy(pathname) ?? AUTHENTICATED_FALLBACK_POLICY;
}

export function isPublicPageRoute(pathname: string): boolean {
    return getPageAccessPolicy(pathname).level === 'public';
}

export function isRoleAllowedForPage(role: string | null | undefined, policy: PageAccessPolicy): boolean {
    if (policy.level === 'public' || policy.level === 'authenticated') {
        return true;
    }
    return Boolean(role && policy.allowedRoles?.includes(role));
}

function roleListIncludes(roles: readonly string[], role: string | null | undefined): boolean {
    return Boolean(role && roles.includes(role));
}

export function isTenantStaffRole(role: string | null | undefined): boolean {
    return roleListIncludes(TENANT_STAFF_PAGE_ROLES, role);
}

export function isPlatformRole(role: string | null | undefined): boolean {
    return roleListIncludes(PLATFORM_PAGE_ROLES, role);
}

export function isTeacherWorkspaceRole(role: string | null | undefined): boolean {
    return roleListIncludes(TEACHER_PAGE_ROLES, role);
}
