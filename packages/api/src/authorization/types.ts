export const AUTHORIZATION_ROLE_VALUES = [
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
    'PARENT',
    'STUDENT',
] as const;

export type AuthorizationRole = (typeof AUTHORIZATION_ROLE_VALUES)[number];

export type AuthorizationScope =
    | 'platform'
    | 'tenant'
    | 'department'
    | 'class'
    | 'assigned'
    | 'own';

export type AuthorizationOperation = 'read' | 'create' | 'update' | 'delete' | 'export';

export interface PermissionParts {
    resource: string;
    action: string;
    scope?: AuthorizationScope;
}

export interface PermissionGrant {
    permission: string;
    scope: AuthorizationScope;
    description?: string;
    requiresExplicitScope?: boolean;
}

export interface AuthorizationContext {
    role: string;
    tenantId?: string;
    userId?: string;
    departmentId?: string;
    activeModules?: readonly string[];
    mfaVerified?: boolean;
    impersonating?: boolean;
}

export interface ResourceAccessRequest {
    permission: string;
    requiredScope?: AuthorizationScope;
    resource?: string;
    operation?: AuthorizationOperation;
    resourceTenantId?: string;
    ownerUserId?: string;
    assignedUserId?: string;
    guardianUserIds?: readonly string[];
    teacherUserIds?: readonly string[];
    departmentId?: string;
    fields?: readonly string[];
    approvalPolicyId?: string;
}

export interface ApprovalPolicy {
    id: string;
    label: string;
    permission: string;
    requiredApproverRoles: readonly AuthorizationRole[];
    minApprovals: number;
    requiresReason: boolean;
    auditAction: string;
    description: string;
}

export interface FieldPolicy {
    resource: string;
    fields: readonly string[];
    readRoles: readonly AuthorizationRole[];
    writeRoles: readonly AuthorizationRole[];
    classification: 'public' | 'student_pii' | 'staff_pii' | 'financial' | 'secret';
    description: string;
}

export interface RoutePolicy {
    prefix: string;
    permission: string;
    scope: AuthorizationScope;
    description: string;
}

export interface AuthorizationDecision {
    allowed: boolean;
    reason?: string;
    matchedPermission?: string;
    scope?: AuthorizationScope;
    deniedFields?: readonly string[];
    approvalRequired?: ApprovalPolicy;
}
