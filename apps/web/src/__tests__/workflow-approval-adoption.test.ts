import {
    AUTHORIZATION_ROUTE_POLICIES,
    findRoutePolicy,
    hasFineGrainedPermission,
} from '../../../../packages/api/src/authorization';
import {
    assertApprovalMatchesAction,
    createApprovalIdempotencyKey,
    createWorkflowApprovalRequest,
    toWorkflowApprovalSummary,
} from '../../../../packages/api/src/workflows/approvals';
import {
    buildExamPublishApprovalPayload,
    buildRoleChangeApprovalPayload,
    buildStudentLifecycleApprovalPayload,
    workflowAdoptionHttpStatus,
    type ExamSnapshot,
    type StudentSnapshot,
    type UserSnapshot,
} from '@/lib/workflows/adoption-execution';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const REQUESTER = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'SUPER_ADMIN' as const,
    tenantId: TENANT_ID,
};

describe('Workflow approval adoption architecture', () => {
    it('registers workflow approvals as a protected API boundary', () => {
        expect(AUTHORIZATION_ROUTE_POLICIES.length).toBeGreaterThanOrEqual(16);
        expect(findRoutePolicy('/api/workflow-approvals')).toMatchObject({
            permission: 'workflow_approvals:read',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/approvals')).toMatchObject({
            permission: 'workflow_approvals:read',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/api/finance/invoices/inv-1/waive')).toMatchObject({
            permission: 'fees:approve',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/api/identity/users/user-1/role-change')).toMatchObject({
            permission: 'settings:write',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/api/students/student-1/transfer')).toMatchObject({
            permission: 'students:read',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/api/exams/exam-1/publish')).toMatchObject({
            permission: 'exams:read',
            scope: 'tenant',
        });
        expect(findRoutePolicy('/api/agents/approvals')).toMatchObject({
            permission: 'agents:approve',
            scope: 'tenant',
        });
        expect(hasFineGrainedPermission('SCHOOL_ADMIN', 'workflow_approvals:read')).toBe(true);
        expect(hasFineGrainedPermission('FINANCE_LEAD', 'workflow_approvals:create')).toBe(true);
        expect(hasFineGrainedPermission('SCHOOL_ADMIN', 'agents:approve')).toBe(true);
    });

    it('builds stable idempotency keys that are sensitive to approved payload changes', () => {
        const resource = {
            type: 'bi_export',
            id: 'exports.udise_plus:annual',
            tenantId: TENANT_ID,
        };

        const first = createApprovalIdempotencyKey({
            policyId: 'data.export_pii',
            resource,
            payload: {
                format: 'csv',
                reason: 'Annual filing',
                metricIds: ['active_students'],
            },
        });
        const reordered = createApprovalIdempotencyKey({
            policyId: 'data.export_pii',
            resource,
            payload: {
                metricIds: ['active_students'],
                reason: 'Annual filing',
                format: 'csv',
            },
        });
        const changed = createApprovalIdempotencyKey({
            policyId: 'data.export_pii',
            resource,
            payload: {
                format: 'csv',
                reason: 'Different purpose',
                metricIds: ['active_students'],
            },
        });

        expect(first).toBe(reordered);
        expect(first).not.toBe(changed);
    });

    it('prevents reusing an approval for a different policy, resource, or payload', () => {
        const approval = createWorkflowApprovalRequest({
            id: '11111111-1111-4111-8111-111111111112',
            policyId: 'data.export_pii',
            tenantId: TENANT_ID,
            resource: {
                type: 'bi_export',
                id: 'exports.udise_plus:annual',
                tenantId: TENANT_ID,
            },
            payload: {
                exportPolicyId: 'exports.udise_plus',
                reason: 'Annual filing',
                __approvalPayloadHash: 'expected-hash-from-persisted-request',
            },
            requestedBy: REQUESTER,
            now: new Date('2026-07-02T00:00:00.000Z'),
        });

        expect(() => assertApprovalMatchesAction(approval, {
            policyId: 'metadata.publish',
            tenantId: TENANT_ID,
            resource: {
                type: 'bi_export',
                id: 'exports.udise_plus:annual',
                tenantId: TENANT_ID,
            },
            payload: {
                exportPolicyId: 'exports.udise_plus',
                reason: 'Annual filing',
            },
        })).toThrow('policy does not match');

        expect(() => assertApprovalMatchesAction(approval, {
            policyId: 'data.export_pii',
            tenantId: TENANT_ID,
            resource: {
                type: 'bi_export',
                id: 'exports.cbse_results:all',
                tenantId: TENANT_ID,
            },
            payload: {
                exportPolicyId: 'exports.udise_plus',
                reason: 'Annual filing',
            },
        })).toThrow('resource does not match');

        expect(() => assertApprovalMatchesAction(approval, {
            policyId: 'data.export_pii',
            tenantId: TENANT_ID,
            resource: {
                type: 'bi_export',
                id: 'exports.udise_plus:annual',
                tenantId: TENANT_ID,
            },
            payload: {
                exportPolicyId: 'exports.udise_plus',
                reason: 'Changed reason',
            },
        })).toThrow('payload does not match');
    });

    it('summarizes approvals without exposing raw approval payloads', () => {
        const approval = createWorkflowApprovalRequest({
            id: '11111111-1111-4111-8111-111111111113',
            policyId: 'metadata.publish',
            tenantId: TENANT_ID,
            resource: {
                type: 'metadata_object',
                id: 'student',
                tenantId: TENANT_ID,
            },
            payload: {
                field: {
                    apiName: 'blood_group',
                },
            },
            requestedBy: REQUESTER,
            now: new Date('2026-07-02T00:00:00.000Z'),
        });

        const summary = toWorkflowApprovalSummary(approval);

        expect(summary).toMatchObject({
            id: approval.id,
            policyId: 'metadata.publish',
            resourceType: 'metadata_object',
            resourceId: 'student',
            description: approval.description,
            status: 'PENDING',
        });
        expect(summary).not.toHaveProperty('payload');
    });

    it('builds immutable workflow payloads for adopted domain execution paths', () => {
        const user: UserSnapshot = {
            id: '22222222-2222-4222-8222-222222222222',
            tenantId: TENANT_ID,
            email: 'registrar@example.edu',
            firstName: 'Ria',
            lastName: 'Registrar',
            role: 'ACCOUNTANT',
            isActive: true,
        };
        const student: StudentSnapshot = {
            id: '33333333-3333-4333-8333-333333333333',
            tenantId: TENANT_ID,
            admissionNumber: 'ADM-2026-001',
            firstName: 'Asha',
            lastName: 'Student',
            status: 'ACTIVE',
            gradeId: '44444444-4444-4444-8444-444444444444',
            sectionId: '55555555-5555-4555-8555-555555555555',
        };
        const exam: ExamSnapshot = {
            id: '66666666-6666-4666-8666-666666666666',
            tenantId: TENANT_ID,
            name: 'Final Term',
            status: 'RESULT_REVIEW',
            resultCount: 120,
            lockedResultCount: 110,
            scheduleCount: 8,
            publishedAt: null,
        };

        expect(buildRoleChangeApprovalPayload(user, 'REGISTRAR', 'Registrar coverage')).toMatchObject({
            action: 'CHANGE_USER_ROLE',
            userId: user.id,
            currentRole: 'ACCOUNTANT',
            targetRole: 'REGISTRAR',
            reason: 'Registrar coverage',
        });
        expect(buildStudentLifecycleApprovalPayload(
            'TRANSFER_STUDENT',
            student,
            'TRANSFERRED',
            'Family relocation',
            { destination: 'North Campus', effectiveDate: '2026-07-10' },
        )).toMatchObject({
            action: 'TRANSFER_STUDENT',
            studentId: student.id,
            currentStatus: 'ACTIVE',
            targetStatus: 'TRANSFERRED',
            reason: 'Family relocation',
            destination: 'North Campus',
        });
        expect(buildExamPublishApprovalPayload(exam)).toMatchObject({
            action: 'PUBLISH_EXAM_RESULTS',
            examId: exam.id,
            currentStatus: 'RESULT_REVIEW',
            resultCount: 120,
            lockedResultCount: 110,
        });
    });

    it('maps adopted workflow execution results to deterministic HTTP statuses', () => {
        const pendingApproval = createWorkflowApprovalRequest({
            id: '77777777-7777-4777-8777-777777777777',
            policyId: 'users.role_change',
            tenantId: TENANT_ID,
            resource: {
                type: 'identity.user',
                id: '22222222-2222-4222-8222-222222222222',
                tenantId: TENANT_ID,
            },
            payload: {
                action: 'CHANGE_USER_ROLE',
            },
            requestedBy: REQUESTER,
            now: new Date('2026-07-02T00:00:00.000Z'),
        });

        expect(workflowAdoptionHttpStatus({
            status: 'APPROVAL_REQUIRED',
            approval: toWorkflowApprovalSummary(pendingApproval),
        })).toBe(202);
        expect(workflowAdoptionHttpStatus({
            status: 'EXECUTED',
            action: 'USER_ROLE_CHANGED',
            approvalRequestId: pendingApproval.id,
            resourceType: 'identity.user',
            resourceId: '22222222-2222-4222-8222-222222222222',
        })).toBe(200);
    });
});
