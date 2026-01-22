import { ROLES, type UserRole } from './constants';

// Dashboard widgets that can be shown
export const DASHBOARD_WIDGETS = {
    // Admin/Accountant widgets
    FEES_KPI: 'fees_kpi',
    FEES_MODULE: 'fees_module',
    ADMISSIONS_MODULE: 'admissions_module',
    TIMETABLE_MODULE: 'timetable_module',
    TRANSPORT_MODULE: 'transport_module',
    CONSENT_MODULE: 'consent_module',
    RECENT_ACTIVITY: 'recent_activity',

    // Parent widgets
    MY_CHILDREN: 'my_children',
    MY_INVOICES: 'my_invoices',
    PAY_NOW: 'pay_now',
    MY_RECEIPTS: 'my_receipts',
    TRANSPORT_TRACKER: 'transport_tracker',

    // Teacher widgets
    TODAY_TIMETABLE: 'today_timetable',
    ATTENDANCE_DRAFT: 'attendance_draft',
    MY_CLASSES: 'my_classes',
} as const;

type WidgetKey = typeof DASHBOARD_WIDGETS[keyof typeof DASHBOARD_WIDGETS];

// Role to widgets mapping
const ROLE_WIDGETS: Record<string, WidgetKey[]> = {
    SUPER_ADMIN: [
        DASHBOARD_WIDGETS.FEES_KPI,
        DASHBOARD_WIDGETS.FEES_MODULE,
        DASHBOARD_WIDGETS.ADMISSIONS_MODULE,
        DASHBOARD_WIDGETS.TIMETABLE_MODULE,
        DASHBOARD_WIDGETS.TRANSPORT_MODULE,
        DASHBOARD_WIDGETS.CONSENT_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    SCHOOL_ADMIN: [
        DASHBOARD_WIDGETS.FEES_KPI,
        DASHBOARD_WIDGETS.FEES_MODULE,
        DASHBOARD_WIDGETS.ADMISSIONS_MODULE,
        DASHBOARD_WIDGETS.TIMETABLE_MODULE,
        DASHBOARD_WIDGETS.TRANSPORT_MODULE,
        DASHBOARD_WIDGETS.CONSENT_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    PRINCIPAL: [
        DASHBOARD_WIDGETS.FEES_KPI,
        DASHBOARD_WIDGETS.FEES_MODULE,
        DASHBOARD_WIDGETS.ADMISSIONS_MODULE,
        DASHBOARD_WIDGETS.TIMETABLE_MODULE,
        DASHBOARD_WIDGETS.TRANSPORT_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    ACCOUNTANT: [
        DASHBOARD_WIDGETS.FEES_KPI,
        DASHBOARD_WIDGETS.FEES_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    ADMISSION_COUNSELOR: [
        DASHBOARD_WIDGETS.ADMISSIONS_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    TEACHER: [
        DASHBOARD_WIDGETS.TODAY_TIMETABLE,
        DASHBOARD_WIDGETS.ATTENDANCE_DRAFT,
        DASHBOARD_WIDGETS.MY_CLASSES,
    ],
    TRANSPORT_MANAGER: [
        DASHBOARD_WIDGETS.TRANSPORT_MODULE,
        DASHBOARD_WIDGETS.RECENT_ACTIVITY,
    ],
    PARENT: [
        DASHBOARD_WIDGETS.MY_CHILDREN,
        DASHBOARD_WIDGETS.MY_INVOICES,
        DASHBOARD_WIDGETS.PAY_NOW,
        DASHBOARD_WIDGETS.MY_RECEIPTS,
        DASHBOARD_WIDGETS.TRANSPORT_TRACKER,
    ],
    STUDENT: [
        DASHBOARD_WIDGETS.TODAY_TIMETABLE,
        DASHBOARD_WIDGETS.MY_INVOICES,
    ],
};

/**
 * Check if a role can access a specific widget
 */
export function canAccessWidget(role: string, widget: WidgetKey): boolean {
    const widgets = ROLE_WIDGETS[role] || [];
    return widgets.includes(widget);
}

/**
 * Get all widgets for a role
 */
export function getWidgetsForRole(role: string): WidgetKey[] {
    return ROLE_WIDGETS[role] || [];
}

/**
 * Check if role is admin-level (can see fees KPIs)
 */
export function isAdminRole(role: string): boolean {
    return [
        ROLES.SUPER_ADMIN,
        ROLES.SCHOOL_ADMIN,
        ROLES.PRINCIPAL,
        ROLES.ACCOUNTANT,
    ].includes(role as any);
}

/**
 * Check if role is staff (non-parent/student)
 */
export function isStaffRole(role: string): boolean {
    return ![ROLES.PARENT, ROLES.STUDENT].includes(role as any);
}

/**
 * Get dashboard type for role
 */
export function getDashboardType(role: string): 'admin' | 'teacher' | 'parent' | 'student' {
    if (isAdminRole(role)) return 'admin';
    if (role === ROLES.TEACHER) return 'teacher';
    if (role === ROLES.PARENT) return 'parent';
    return 'student';
}
