// App constants
export const APP_NAME = 'ScholarMind';
export const APP_TAGLINE = 'Secure multi-tenant school management platform';

export const ROLES = {
    PLATFORM_ADMIN: 'PLATFORM_ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
    GROUP_EXECUTIVE: 'GROUP_EXECUTIVE',
    SCHOOL_ADMIN: 'SCHOOL_ADMIN',
    PRINCIPAL: 'PRINCIPAL',
    REGISTRAR: 'REGISTRAR',
    FINANCE_LEAD: 'FINANCE_LEAD',
    ACCOUNTANT: 'ACCOUNTANT',
    ADMISSION_COUNSELOR: 'ADMISSION_COUNSELOR',
    STUDENT_SUCCESS_COUNSELOR: 'STUDENT_SUCCESS_COUNSELOR',
    TEACHER: 'TEACHER',
    TRANSPORT_MANAGER: 'TRANSPORT_MANAGER',
    TRUST_OFFICER: 'TRUST_OFFICER',
    CREDENTIAL_OFFICER: 'CREDENTIAL_OFFICER',
    PARENT: 'PARENT',
    STUDENT: 'STUDENT',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Role display names
export const ROLE_LABELS: Record<string, string> = {
    PLATFORM_ADMIN: 'Platform Owner',
    SUPER_ADMIN: 'Super Admin',
    GROUP_EXECUTIVE: 'Group Executive',
    SCHOOL_ADMIN: 'School Admin',
    PRINCIPAL: 'Principal',
    REGISTRAR: 'Registrar',
    FINANCE_LEAD: 'Finance Lead',
    ACCOUNTANT: 'Accountant',
    ADMISSION_COUNSELOR: 'Admission Counselor',
    STUDENT_SUCCESS_COUNSELOR: 'Student Success Counselor',
    TEACHER: 'Teacher',
    TRANSPORT_MANAGER: 'Transport Manager',
    TRUST_OFFICER: 'Trust Officer',
    CREDENTIAL_OFFICER: 'Credential Officer',
    PARENT: 'Parent',
    STUDENT: 'Student',
};

// Role badge colors — Oxford Navy & Heritage Brass semantic tokens
export const ROLE_COLORS: Record<string, string> = {
    PLATFORM_ADMIN: 'bg-primary text-primary-foreground border border-brass/50',
    SUPER_ADMIN: 'bg-primary text-primary-foreground border border-brass/40',
    GROUP_EXECUTIVE: 'bg-primary text-primary-foreground border border-brass/40',
    SCHOOL_ADMIN: 'bg-accent text-accent-foreground border border-brass/40',
    PRINCIPAL: 'bg-accent text-accent-foreground border border-brass/40',
    REGISTRAR: 'bg-accent text-accent-foreground border border-brass/35',
    FINANCE_LEAD: 'bg-accent text-accent-foreground border border-brass/45',
    ACCOUNTANT: 'bg-success-subtle text-success-subtle-foreground border border-success/30',
    ADMISSION_COUNSELOR: 'bg-warning-subtle text-warning-subtle-foreground border border-warning/30',
    STUDENT_SUCCESS_COUNSELOR: 'bg-info-subtle text-info-subtle-foreground border border-info/30',
    TEACHER: 'bg-info-subtle text-info-subtle-foreground border border-info/30',
    TRANSPORT_MANAGER: 'bg-accent text-accent-foreground border border-brass/30',
    TRUST_OFFICER: 'bg-accent text-accent-foreground border border-brass/35',
    CREDENTIAL_OFFICER: 'bg-accent text-accent-foreground border border-brass/35',
    PARENT: 'bg-secondary text-secondary-foreground border border-border',
    STUDENT: 'bg-muted text-foreground border border-border',
};

// Value propositions for auth page
export const VALUE_PROPS = [
    {
        icon: 'indian-rupee',
        title: 'Fee Intelligence',
        description: 'Real-time dues tracking, automated WhatsApp pay links, and collection analytics',
    },
    {
        icon: 'trending-up',
        title: 'Defaulter Insights',
        description: 'AI-powered risk scoring and personalized follow-up strategies',
    },
    {
        icon: 'shield-check',
        title: 'Consent-Aware',
        description: 'DPDP & GDPR-compliant messaging with guardian consent enforcement',
    },
    {
        icon: 'building-2',
        title: 'Multi-Tenant',
        description: 'Complete RLS data isolation across schools with unified platform governance',
    },
];

// Trust badges
export const TRUST_BADGES = [
    'Tenant-isolated',
    'Audit trails',
    'Consent-aware',
    'RBAC secured',
];
