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
        expect(hasFineGrainedPermission('SCHOOL_ADMIN', 'workflow_approvals:read')).toBe(true);
        expect(hasFineGrainedPermission('FINANCE_LEAD', 'workflow_approvals:create')).toBe(true);
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
            status: 'PENDING',
        });
        expect(summary).not.toHaveProperty('payload');
    });
});
