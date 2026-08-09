import { evaluateCapability } from './evaluator';
import type {
    CapabilityEvaluationContext,
    CapabilityId,
    InstitutionType,
    Permission,
} from './types';

export const ADMIN_NAVIGATION_GROUP_IDS = [
    'workspace',
    'academics',
    'finance',
    'communications',
    'settings',
    'group',
] as const;

export type AdminNavigationGroupId = (typeof ADMIN_NAVIGATION_GROUP_IDS)[number];

export const ADMIN_NAVIGATION_ICON_IDS = [
    'layout-dashboard',
    'clipboard-check',
    'users',
    'user-round-cog',
    'graduation-cap',
    'calendar-check',
    'file-check',
    'calendar-days',
    'wallet-cards',
    'receipt-text',
    'landmark',
    'mail',
    'plug',
    'list-checks',
    'shield-check',
    'school',
    'building-two',
] as const;

export type AdminNavigationIconId = (typeof ADMIN_NAVIGATION_ICON_IDS)[number];

export type AdminNavigationItem = {
    id: string;
    label: string;
    href: string;
    group: AdminNavigationGroupId;
    capabilityId: CapabilityId;
    icon: AdminNavigationIconId;
    requiredPermission?: Permission;
    institutionTypes?: readonly InstitutionType[];
    allowedRoles?: readonly string[];
};

export const ADMIN_NAVIGATION_GROUPS = [
    { id: 'workspace', label: null },
    { id: 'academics', label: 'Academics' },
    { id: 'finance', label: 'Finance' },
    { id: 'communications', label: 'Communications' },
    { id: 'settings', label: 'Settings' },
    { id: 'group', label: 'Group HQ' },
] as const satisfies readonly {
    id: AdminNavigationGroupId;
    label: string | null;
}[];

/**
 * Conservative production navigation. Every rendered destination is owned by
 * one registry capability and may add a narrower route permission. Deferred
 * surfaces stay out of this catalog until they have an implementation owner.
 */
export const ADMIN_NAVIGATION_ITEMS: readonly AdminNavigationItem[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        group: 'workspace',
        capabilityId: 'core-sis',
        icon: 'layout-dashboard',
        requiredPermission: 'dashboard:read',
    },
    {
        id: 'approvals',
        label: 'Action Approvals',
        href: '/approvals',
        group: 'workspace',
        capabilityId: 'core-sis',
        icon: 'clipboard-check',
        requiredPermission: 'workflow_approvals:read',
    },
    {
        id: 'students',
        label: 'Students',
        href: '/app/student',
        group: 'workspace',
        capabilityId: 'core-sis',
        icon: 'users',
        requiredPermission: 'students:read',
    },
    {
        id: 'staff',
        label: 'Faculty & Staff',
        href: '/app/staff',
        group: 'workspace',
        capabilityId: 'core-sis',
        icon: 'user-round-cog',
        requiredPermission: 'staff:read',
    },
    {
        id: 'admissions',
        label: 'Admissions',
        href: '/admissions',
        group: 'workspace',
        capabilityId: 'core-sis',
        icon: 'graduation-cap',
        requiredPermission: 'admissions:read',
    },
    {
        id: 'attendance',
        label: 'Attendance',
        href: '/attendance',
        group: 'academics',
        capabilityId: 'core-sis',
        icon: 'calendar-check',
        requiredPermission: 'attendance:read',
    },
    {
        id: 'exams',
        label: 'Exams',
        href: '/exams',
        group: 'academics',
        capabilityId: 'core-sis',
        icon: 'file-check',
        requiredPermission: 'exams:read',
    },
    {
        id: 'timetable',
        label: 'Timetable',
        href: '/timetable',
        group: 'academics',
        capabilityId: 'core-sis',
        icon: 'calendar-days',
        requiredPermission: 'timetable:read',
        institutionTypes: ['K12', 'HYBRID'],
    },
    {
        id: 'fees',
        label: 'Fee Collections',
        href: '/fees',
        group: 'finance',
        capabilityId: 'payments',
        icon: 'wallet-cards',
        requiredPermission: 'fees:read',
    },
    {
        id: 'invoices',
        label: 'Invoices',
        href: '/app/invoice',
        group: 'finance',
        capabilityId: 'payments',
        icon: 'receipt-text',
        requiredPermission: 'invoices:read',
    },
    {
        id: 'treasury',
        label: 'Treasury',
        href: '/treasury',
        group: 'finance',
        capabilityId: 'payments',
        icon: 'landmark',
        requiredPermission: 'treasury:read',
    },
    {
        id: 'messages',
        label: 'Messages',
        href: '/messages/templates',
        group: 'communications',
        capabilityId: 'communications',
        icon: 'mail',
        requiredPermission: 'messages:read',
    },
    {
        id: 'integrations',
        label: 'Tally ERP Sync',
        href: '/integrations/tally',
        group: 'communications',
        capabilityId: 'integrations',
        icon: 'plug',
        requiredPermission: 'integrations:read',
    },
    {
        id: 'grading-settings',
        label: 'Grading',
        href: '/settings/grading',
        group: 'settings',
        capabilityId: 'core-sis',
        icon: 'list-checks',
        requiredPermission: 'academic:read',
    },
    {
        id: 'role-settings',
        label: 'Permission Matrix',
        href: '/settings/roles',
        group: 'settings',
        capabilityId: 'core-sis',
        icon: 'shield-check',
        requiredPermission: 'settings:read',
    },
    {
        id: 'user-settings',
        label: 'Users & Roles',
        href: '/settings/users',
        group: 'settings',
        capabilityId: 'core-sis',
        icon: 'user-round-cog',
        requiredPermission: 'settings:read',
    },
    {
        id: 'school-settings',
        label: 'School Settings',
        href: '/settings/school',
        group: 'settings',
        capabilityId: 'core-sis',
        icon: 'school',
        requiredPermission: 'settings:read',
    },
    {
        id: 'hq-overview',
        label: 'Command Center',
        href: '/hq-overview',
        group: 'group',
        capabilityId: 'group-governance',
        icon: 'building-two',
        requiredPermission: 'hq:read',
        allowedRoles: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'GROUP_EXECUTIVE'],
    },
    {
        id: 'campuses',
        label: 'Campuses',
        href: '/schools',
        group: 'group',
        capabilityId: 'group-governance',
        icon: 'school',
        requiredPermission: 'hq:read',
        allowedRoles: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'GROUP_EXECUTIVE'],
    },
] as const;

export type VisibleAdminNavigationGroup = {
    id: AdminNavigationGroupId;
    label: string | null;
    items: readonly AdminNavigationItem[];
};

export function buildAdminNavigation(
    context: CapabilityEvaluationContext,
    role: string,
): readonly VisibleAdminNavigationGroup[] {
    const capabilityAvailability = new Map<CapabilityId, boolean>();
    const capabilityIsAvailable = (capabilityId: CapabilityId) => {
        if (!capabilityAvailability.has(capabilityId)) {
            capabilityAvailability.set(
                capabilityId,
                evaluateCapability(capabilityId, context).available,
            );
        }
        return capabilityAvailability.get(capabilityId) === true;
    };

    const visibleItems = ADMIN_NAVIGATION_ITEMS.filter((item) => {
        if (!capabilityIsAvailable(item.capabilityId)) return false;
        if (item.allowedRoles && !item.allowedRoles.includes(role)) return false;
        if (
            item.institutionTypes
            && (!context.institutionType
                || !item.institutionTypes.includes(context.institutionType as InstitutionType))
        ) {
            return false;
        }
        return !item.requiredPermission || Boolean(context.hasPermission?.(item.requiredPermission));
    });

    return ADMIN_NAVIGATION_GROUPS
        .map((group) => ({
            ...group,
            items: visibleItems.filter((item) => item.group === group.id),
        }))
        .filter((group) => group.items.length > 0);
}
