import {
    AUTHORIZATION_APPROVAL_POLICIES,
    AUTHORIZATION_FIELD_POLICIES,
    AUTHORIZATION_ROUTE_POLICIES,
    evaluateAccess,
    findRoutePolicy,
    getApprovalPolicy,
    hasFineGrainedPermission,
} from '../../../../packages/api/src/authorization';
import { CORE_SIS_MODULES } from '../../../../packages/api/src/domain/core-sis';
import {
    getPermissionsForRole,
    hasPermission,
    isAdmin,
    isStaff,
    requirePermission,
    UserRole,
} from '../lib/rbac/permissions';

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const TEACHER_ID = 'teacher-1';
const PARENT_ID = 'parent-1';
const STUDENT_ID = 'student-1';

describe('Fine-grained authorization architecture', () => {
    it('keeps the existing web RBAC facade compatible with scoped permissions', () => {
        expect(hasPermission(UserRole.SCHOOL_ADMIN, 'fees:read')).toBe(true);
        expect(hasPermission(UserRole.SCHOOL_ADMIN, 'fees:approve')).toBe(true);
        expect(hasPermission(UserRole.TEACHER, 'gradebook:write')).toBe(true);
        expect(hasPermission(UserRole.PLATFORM_ADMIN, 'platform:read')).toBe(true);
        expect(hasPermission(UserRole.SUPER_ADMIN, 'platform:read')).toBe(false);
        expect(hasPermission(UserRole.PARENT, 'fees:read')).toBe(false);
        expect(hasPermission(UserRole.PARENT, 'fees:read:own')).toBe(true);
        expect(getPermissionsForRole(UserRole.PARENT)).toContain('fees:read:own');

        expect(isAdmin(UserRole.PRINCIPAL)).toBe(true);
        expect(isAdmin(UserRole.TEACHER)).toBe(false);
        expect(isStaff(UserRole.TEACHER)).toBe(true);
        expect(isStaff(UserRole.PARENT)).toBe(false);
        expect(() => requirePermission(UserRole.PARENT, 'fees:read')).toThrow('Unauthorized');
    });

    it('enforces platform and tenant boundaries when context is provided', () => {
        expect(evaluateAccess({
            role: 'PLATFORM_ADMIN',
            tenantId: TENANT_ID,
            userId: 'platform-admin',
        }, {
            permission: 'platform:read',
            requiredScope: 'platform',
            resourceTenantId: OTHER_TENANT_ID,
        }).allowed).toBe(true);

        expect(evaluateAccess({
            role: 'SUPER_ADMIN',
            tenantId: TENANT_ID,
            userId: 'super-admin',
        }, {
            permission: 'platform:read',
        }).allowed).toBe(false);

        expect(evaluateAccess({
            role: 'SUPER_ADMIN',
            tenantId: TENANT_ID,
            userId: 'super-admin',
        }, {
            permission: 'students:read',
            resourceTenantId: OTHER_TENANT_ID,
        })).toMatchObject({
            allowed: false,
            reason: 'Cross-tenant access requires PLATFORM_ADMIN.',
        });

        expect(evaluateAccess({
            role: 'SCHOOL_ADMIN',
            tenantId: TENANT_ID,
            userId: 'school-admin',
        }, {
            permission: 'students:read',
            resourceTenantId: TENANT_ID,
        }).allowed).toBe(true);
    });

    it('enforces own and class-scoped resource access', () => {
        expect(evaluateAccess({
            role: 'PARENT',
            tenantId: TENANT_ID,
            userId: PARENT_ID,
        }, {
            permission: 'fees:read:own',
            resourceTenantId: TENANT_ID,
            ownerUserId: STUDENT_ID,
            guardianUserIds: [PARENT_ID],
        }).allowed).toBe(true);

        expect(evaluateAccess({
            role: 'PARENT',
            tenantId: TENANT_ID,
            userId: PARENT_ID,
        }, {
            permission: 'fees:read:own',
            resourceTenantId: TENANT_ID,
            ownerUserId: STUDENT_ID,
            guardianUserIds: ['other-parent'],
        }).allowed).toBe(false);

        expect(evaluateAccess({
            role: 'TEACHER',
            tenantId: TENANT_ID,
            userId: TEACHER_ID,
        }, {
            permission: 'gradebook:update:class',
            resourceTenantId: TENANT_ID,
            teacherUserIds: [TEACHER_ID],
        }).allowed).toBe(true);

        expect(evaluateAccess({
            role: 'TEACHER',
            tenantId: TENANT_ID,
            userId: TEACHER_ID,
        }, {
            permission: 'gradebook:update:class',
            resourceTenantId: TENANT_ID,
            teacherUserIds: ['other-teacher'],
        }).allowed).toBe(false);
    });

    it('applies field-level policies to sensitive student and payment fields', () => {
        expect(AUTHORIZATION_FIELD_POLICIES.length).toBeGreaterThanOrEqual(5);

        const teacherDecision = evaluateAccess({
            role: 'TEACHER',
            tenantId: TENANT_ID,
            userId: TEACHER_ID,
        }, {
            permission: 'students:read:class',
            resourceTenantId: TENANT_ID,
            resource: 'students',
            operation: 'read',
            fields: ['firstName', 'aadhaarNumber'],
            teacherUserIds: [TEACHER_ID],
        });

        expect(teacherDecision).toMatchObject({
            allowed: false,
            deniedFields: ['aadhaarNumber'],
        });

        expect(evaluateAccess({
            role: 'REGISTRAR',
            tenantId: TENANT_ID,
            userId: 'registrar-1',
        }, {
            permission: 'students:read',
            resourceTenantId: TENANT_ID,
            resource: 'students',
            operation: 'read',
            fields: ['firstName', 'aadhaarNumber'],
        }).allowed).toBe(true);

        expect(evaluateAccess({
            role: 'ACCOUNTANT',
            tenantId: TENANT_ID,
            userId: 'accountant-1',
        }, {
            permission: 'payments:read',
            resourceTenantId: TENANT_ID,
            resource: 'payments',
            operation: 'read',
            fields: ['amount', 'providerPaymentId'],
        }).allowed).toBe(true);
    });

    it('publishes approval and route policies for high-risk operations', () => {
        expect(AUTHORIZATION_APPROVAL_POLICIES.length).toBeGreaterThanOrEqual(8);
        expect(getApprovalPolicy('payments.refund')).toMatchObject({
            permission: 'payments:refund',
            requiresReason: true,
        });

        const refundDecision = evaluateAccess({
            role: 'FINANCE_LEAD',
            tenantId: TENANT_ID,
            userId: 'finance-lead',
        }, {
            permission: 'payments:refund',
            resourceTenantId: TENANT_ID,
            approvalPolicyId: 'payments.refund',
        });

        expect(refundDecision.allowed).toBe(true);
        expect(refundDecision.approvalRequired?.id).toBe('payments.refund');

        expect(AUTHORIZATION_ROUTE_POLICIES.length).toBeGreaterThanOrEqual(15);
        expect(findRoutePolicy('/platform/tenants')).toMatchObject({
            permission: 'platform:read',
            scope: 'platform',
        });
        expect(findRoutePolicy('/my-fees')).toMatchObject({
            permission: 'fees:read',
            scope: 'own',
        });
    });

    it('covers the Core SIS permission catalog with the central policy', () => {
        const missingForSchoolAdmin = CORE_SIS_MODULES
            .flatMap((module) => module.permissions)
            .filter((permission) => !hasFineGrainedPermission('SCHOOL_ADMIN', permission));

        expect(missingForSchoolAdmin).toEqual([]);
    });
});
