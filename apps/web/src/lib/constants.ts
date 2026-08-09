// App constants
export const APP_NAME = 'ScholarMind';
export const APP_TAGLINE = 'Governed education operations';

export const ROLES = {
    PLATFORM_ADMIN: 'PLATFORM_ADMIN',
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
    PLATFORM_ADMIN: 'Platform Owner',
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
    PLATFORM_ADMIN: 'bg-primary text-primary-foreground',
    SUPER_ADMIN: 'bg-secondary text-secondary-foreground',
    SCHOOL_ADMIN: 'bg-info-muted text-info',
    PRINCIPAL: 'bg-primary/10 text-primary',
    ACCOUNTANT: 'bg-success-muted text-success',
    ADMISSION_COUNSELOR: 'bg-warning-muted text-warning',
    TEACHER: 'bg-info-muted text-info',
    TRANSPORT_MANAGER: 'bg-warning-muted text-warning',
    PARENT: 'bg-primary/10 text-primary',
    STUDENT: 'bg-secondary text-secondary-foreground',
};
