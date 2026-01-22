// App constants
export const APP_NAME = 'School SIS';
export const APP_TAGLINE = 'Secure multi-tenant school management platform';

export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    SCHOOL_ADMIN: 'SCHOOL_ADMIN',
    PRINCIPAL: 'PRINCIPAL',
    ACCOUNTANT: 'ACCOUNTANT',
    ADMISSION_COUNSELOR: 'ADMISSION_COUNSELOR',
    TEACHER: 'TEACHER',
    TRANSPORT_MANAGER: 'TRANSPORT_MANAGER',
    PARENT: 'PARENT',
    STUDENT: 'STUDENT',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Role display names
export const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    SCHOOL_ADMIN: 'School Admin',
    PRINCIPAL: 'Principal',
    ACCOUNTANT: 'Accountant',
    ADMISSION_COUNSELOR: 'Admission Counselor',
    TEACHER: 'Teacher',
    TRANSPORT_MANAGER: 'Transport Manager',
    PARENT: 'Parent',
    STUDENT: 'Student',
};

// Role badge colors
export const ROLE_COLORS: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    SCHOOL_ADMIN: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    PRINCIPAL: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    ACCOUNTANT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    ADMISSION_COUNSELOR: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    TEACHER: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    TRANSPORT_MANAGER: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    PARENT: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
    STUDENT: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
};

// Demo credentials
export const DEMO_CREDENTIALS = [
    { role: 'Admin', email: 'admin@greenwood.edu', password: 'admin123' },
    { role: 'Accountant', email: 'accountant@greenwood.edu', password: 'accountant123' },
    { role: 'Parent', email: 'parent@example.com', password: 'parent123' },
];

// Value propositions for auth page
export const VALUE_PROPS = [
    {
        icon: '💰',
        title: 'Fee Intelligence',
        description: 'Real-time dues tracking, automated reminders, and collection analytics',
    },
    {
        icon: '📊',
        title: 'Defaulter Insights',
        description: 'AI-powered risk scoring and personalized follow-up strategies',
    },
    {
        icon: '🔐',
        title: 'Consent-Aware',
        description: 'GDPR-compliant messaging with guardian consent enforcement',
    },
    {
        icon: '🏫',
        title: 'Multi-Tenant',
        description: 'Complete data isolation across schools with unified platform',
    },
];

// Trust badges
export const TRUST_BADGES = [
    'Tenant-isolated',
    'Audit trails',
    'Consent-aware',
    'RBAC secured',
];
