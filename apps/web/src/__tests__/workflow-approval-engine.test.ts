import {
    canActorReviewWorkflowApproval,
    countApprovals,
    createWorkflowApprovalRequest,
    escalateWorkflowApprovalRequest,
    expireWorkflowApprovalRequest,
    getApprovalWorkflowPolicy,
    listApprovalWorkflowPolicies,
    reviewWorkflowApprovalRequest,
    toWorkflowApprovalQueueItem,
} from '../../../../packages/api/src/workflows/approvals';

const TENANT_ID = 'tenant-1';
const REQUESTER = {
    userId: 'requester-1',
    role: 'ACCOUNTANT' as const,
    tenantId: TENANT_ID,
};
const FINANCE_LEAD = {
    userId: 'finance-lead-1',
    role: 'FINANCE_LEAD' as const,
    tenantId: TENANT_ID,
};
const SUPER_ADMIN = {
    userId: 'super-admin-1',
    role: 'SUPER_ADMIN' as const,
    tenantId: TENANT_ID,
};
const TEACHER = {
    userId: 'teacher-1',
    role: 'TEACHER' as const,
    tenantId: TENANT_ID,
};

const CREATED_AT = new Date('2026-07-02T00:00:00.000Z');

function createRefundApproval() {
    return createWorkflowApprovalRequest({
        id: 'approval-refund-1',
        policyId: 'payments.refund',
        tenantId: TENANT_ID,
        resource: {
            type: 'payment',
            id: 'pay_123',
            tenantId: TENANT_ID,
            label: 'Refund pay_123',
        },
        requestedBy: REQUESTER,
        payload: {
            amount: 25000,
            currency: 'INR',
            reason: 'Duplicate payment',
        },
        now: CREATED_AT,
    });
}

describe('Workflow approval engine architecture', () => {
    it('publishes workflow policy metadata for authorization approval policies', () => {
        const policies = listApprovalWorkflowPolicies();
        const refundPolicy = getApprovalWorkflowPolicy('payments.refund');

        expect(policies.length).toBeGreaterThanOrEqual(10);
        expect(refundPolicy).toMatchObject({
            slaHours: 4,
            expiryHours: 48,
            allowRequesterApproval: false,
        });
        expect(refundPolicy?.policy.requiredApproverRoles).toContain('FINANCE_LEAD');
        expect(refundPolicy?.escalationApproverRoles).toContain('PLATFORM_ADMIN');
    });

    it('creates tenant-scoped requests with SLA, expiry, and an initial audit event', () => {
        const request = createRefundApproval();

        expect(request).toMatchObject({
            id: 'approval-refund-1',
            tenantId: TENANT_ID,
            policyId: 'payments.refund',
            status: 'PENDING',
            priority: 'HIGH',
            requestedByUserId: REQUESTER.userId,
            minApprovals: 1,
        });
        expect(request.requiredApproverRoles).toEqual(['FINANCE_LEAD', 'SUPER_ADMIN']);
        expect(request.dueAt).toBe('2026-07-02T04:00:00.000Z');
        expect(request.expiresAt).toBe('2026-07-04T00:00:00.000Z');
        expect(request.events).toHaveLength(1);
        expect(request.events[0]).toMatchObject({
            eventType: 'REQUESTED',
            toStatus: 'PENDING',
            actorUserId: REQUESTER.userId,
        });
    });

    it('rejects cross-tenant approval request creation', () => {
        expect(() => createWorkflowApprovalRequest({
            policyId: 'payments.refund',
            tenantId: TENANT_ID,
            resource: {
                type: 'payment',
                tenantId: 'other-tenant',
            },
            requestedBy: REQUESTER,
            now: CREATED_AT,
        })).toThrow('requester and resource tenant must match');

        expect(() => createWorkflowApprovalRequest({
            policyId: 'payments.refund',
            tenantId: 'other-tenant',
            resource: {
                type: 'payment',
                tenantId: TENANT_ID,
            },
            requestedBy: REQUESTER,
            now: CREATED_AT,
        })).toThrow('request tenant must match resource tenant');
    });

    it('applies eligible approval reviews and completes once the threshold is met', () => {
        const request = createRefundApproval();
        const reviewed = reviewWorkflowApprovalRequest(request, {
            actor: FINANCE_LEAD,
            decision: 'APPROVED',
            reason: 'Refund matches duplicate payment evidence.',
            now: new Date('2026-07-02T01:00:00.000Z'),
        });

        expect(reviewed.status).toBe('APPROVED');
        expect(reviewed.completedAt).toBe('2026-07-02T01:00:00.000Z');
        expect(countApprovals(reviewed.reviews)).toBe(1);
        expect(reviewed.events.at(-1)).toMatchObject({
            eventType: 'APPROVED',
            fromStatus: 'PENDING',
            toStatus: 'APPROVED',
            actorUserId: FINANCE_LEAD.userId,
        });
    });

    it('blocks self-approval, duplicate reviews, and ineligible reviewer roles', () => {
        const request = createRefundApproval();
        const eligibleRequesterRequest = createWorkflowApprovalRequest({
            id: 'approval-self-review-1',
            policyId: 'payments.refund',
            tenantId: TENANT_ID,
            resource: {
                type: 'payment',
                id: 'pay_self',
                tenantId: TENANT_ID,
            },
            requestedBy: FINANCE_LEAD,
            now: CREATED_AT,
        });

        expect(canActorReviewWorkflowApproval(request, FINANCE_LEAD)).toBe(true);
        expect(canActorReviewWorkflowApproval(eligibleRequesterRequest, FINANCE_LEAD)).toBe(false);
        expect(canActorReviewWorkflowApproval(request, TEACHER)).toBe(false);

        expect(() => reviewWorkflowApprovalRequest(eligibleRequesterRequest, {
            actor: FINANCE_LEAD,
            decision: 'APPROVED',
            reason: 'Trying to approve own request.',
        })).toThrow('Requester cannot approve');

        expect(() => reviewWorkflowApprovalRequest(request, {
            actor: TEACHER,
            decision: 'APPROVED',
            reason: 'Not allowed.',
        })).toThrow('is not eligible');

        const reviewed = reviewWorkflowApprovalRequest(request, {
            actor: FINANCE_LEAD,
            decision: 'APPROVED',
            reason: 'Approved once.',
        });

        expect(() => reviewWorkflowApprovalRequest(reviewed, {
            actor: FINANCE_LEAD,
            decision: 'APPROVED',
            reason: 'Approved twice.',
        })).toThrow('already APPROVED');
    });

    it('requires review reasons for high-risk policies', () => {
        const request = createRefundApproval();

        expect(() => reviewWorkflowApprovalRequest(request, {
            actor: FINANCE_LEAD,
            decision: 'APPROVED',
        })).toThrow('reason is required');

        expect(() => reviewWorkflowApprovalRequest(request, {
            actor: FINANCE_LEAD,
            decision: 'REJECTED',
        })).toThrow('reason is required');
    });

    it('escalates overdue requests and expands eligible approver roles', () => {
        const request = createRefundApproval();

        expect(() => escalateWorkflowApprovalRequest(request, {
            now: new Date('2026-07-02T03:59:59.000Z'),
        })).toThrow('not past its SLA');

        const escalated = escalateWorkflowApprovalRequest(request, {
            actor: SUPER_ADMIN,
            reason: 'SLA breach',
            now: new Date('2026-07-02T04:01:00.000Z'),
        });

        expect(escalated.status).toBe('ESCALATED');
        expect(escalated.escalationLevel).toBe(1);
        expect(escalated.requiredApproverRoles).toContain('PLATFORM_ADMIN');
        expect(escalated.events.at(-1)).toMatchObject({
            eventType: 'ESCALATED',
            toStatus: 'ESCALATED',
            reason: 'SLA breach',
        });
        expect(canActorReviewWorkflowApproval(escalated, SUPER_ADMIN)).toBe(true);
    });

    it('expires requests after the expiry window and projects queue metadata', () => {
        const request = createRefundApproval();
        const queueItem = toWorkflowApprovalQueueItem(request, new Date('2026-07-02T04:30:00.000Z'));

        expect(queueItem).toMatchObject({
            id: request.id,
            approvalsReceived: 0,
            approvalsRequired: 1,
            isOverdue: true,
        });

        const expired = expireWorkflowApprovalRequest(request, new Date('2026-07-04T00:00:01.000Z'));
        expect(expired.status).toBe('EXPIRED');
        expect(expired.completedAt).toBe('2026-07-04T00:00:01.000Z');
        expect(expired.events.at(-1)).toMatchObject({
            eventType: 'EXPIRED',
            toStatus: 'EXPIRED',
        });

        expect(() => reviewWorkflowApprovalRequest(expired, {
            actor: SUPER_ADMIN,
            decision: 'APPROVED',
            reason: 'Too late.',
        })).toThrow('already EXPIRED');
    });
});
