import type { AuthorizationRole } from '../../authorization';
import { getApprovalWorkflowPolicy } from './policy';
import type {
    CancelWorkflowApprovalInput,
    CreateWorkflowApprovalInput,
    EscalateWorkflowApprovalInput,
    ReviewWorkflowApprovalInput,
    WorkflowApprovalActor,
    WorkflowApprovalEvent,
    WorkflowApprovalEventType,
    WorkflowApprovalQueueItem,
    WorkflowApprovalRequest,
    WorkflowApprovalResource,
    WorkflowApprovalReview,
    WorkflowApprovalStatus,
} from './types';

const TERMINAL_STATUSES = new Set<WorkflowApprovalStatus>([
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
]);

export function createWorkflowApprovalRequest(input: CreateWorkflowApprovalInput): WorkflowApprovalRequest {
    const workflowPolicy = getApprovalWorkflowPolicy(input.policyId);
    if (!workflowPolicy) {
        throw new Error(`Unknown approval workflow policy: ${input.policyId}`);
    }

    assertSameTenant(input.requestedBy, input.resource);
    if (input.tenantId !== input.resource.tenantId) {
        throw new Error('Approval request tenant must match resource tenant.');
    }

    const now = input.now ?? new Date();
    const createdAt = now.toISOString();
    const dueAt = addHours(now, workflowPolicy.slaHours).toISOString();
    const expiresAt = addHours(now, workflowPolicy.expiryHours).toISOString();
    const policy = workflowPolicy.policy;

    const request: WorkflowApprovalRequest = {
        id: input.id ?? createStableApprovalId(policy.id, input.resource, createdAt),
        tenantId: input.tenantId,
        policyId: policy.id,
        policy,
        title: input.title ?? policy.label,
        description: input.description ?? policy.description,
        priority: input.priority ?? priorityForPolicy(policy.id),
        status: 'PENDING',
        resource: input.resource,
        payload: input.payload ?? {},
        requestedByUserId: input.requestedBy.userId,
        requestedByRole: input.requestedBy.role,
        requiredApproverRoles: policy.requiredApproverRoles,
        minApprovals: policy.minApprovals,
        allowRequesterApproval: workflowPolicy.allowRequesterApproval,
        escalationLevel: 0,
        dueAt,
        expiresAt,
        createdAt,
        updatedAt: createdAt,
        reviews: [],
        events: [],
    };

    return withEvent(request, {
        eventType: 'REQUESTED',
        toStatus: request.status,
        actorUserId: input.requestedBy.userId,
        actorRole: input.requestedBy.role,
        metadata: {
            policyId: policy.id,
            resourceType: input.resource.type,
            resourceId: input.resource.id,
        },
        createdAt,
    });
}

export function reviewWorkflowApprovalRequest(
    request: WorkflowApprovalRequest,
    input: ReviewWorkflowApprovalInput,
): WorkflowApprovalRequest {
    assertReviewable(request);
    assertActorTenant(request, input.actor);
    assertEligibleApprover(request, input.actor);
    assertNotDuplicateReviewer(request, input.actor.userId);

    if (!request.allowRequesterApproval && input.actor.userId === request.requestedByUserId) {
        throw new Error('Requester cannot approve their own workflow approval request.');
    }

    if ((input.decision === 'REJECTED' || request.policy.requiresReason) && !input.reason?.trim()) {
        throw new Error('Approval review reason is required.');
    }

    const now = input.now ?? new Date();
    const createdAt = now.toISOString();
    const review: WorkflowApprovalReview = {
        id: input.reviewId ?? createReviewId(request.id, input.actor.userId, createdAt),
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        decision: input.decision,
        reason: input.reason,
        delegatedFromUserId: input.actor.delegatedFromUserId,
        createdAt,
    };

    const reviews = [...request.reviews, review];
    const nextStatus = resolveStatusAfterReview(request, reviews, input.decision);

    return withEvent({
        ...request,
        status: nextStatus,
        reviews,
        updatedAt: createdAt,
        completedAt: TERMINAL_STATUSES.has(nextStatus) ? createdAt : request.completedAt,
    }, {
        eventType: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        fromStatus: request.status,
        toStatus: nextStatus,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        reason: input.reason,
        metadata: {
            reviewId: review.id,
            approvalsReceived: countApprovals(reviews),
            approvalsRequired: request.minApprovals,
        },
        createdAt,
    });
}

export function escalateWorkflowApprovalRequest(
    request: WorkflowApprovalRequest,
    input: EscalateWorkflowApprovalInput = {},
): WorkflowApprovalRequest {
    assertReviewable(request);

    const workflowPolicy = getApprovalWorkflowPolicy(request.policyId);
    if (!workflowPolicy) {
        throw new Error(`Unknown approval workflow policy: ${request.policyId}`);
    }

    const now = input.now ?? new Date();
    if (now.getTime() < Date.parse(request.dueAt)) {
        throw new Error('Approval request is not past its SLA due time.');
    }

    const createdAt = now.toISOString();
    const requiredApproverRoles = uniqueRoles([
        ...request.requiredApproverRoles,
        ...workflowPolicy.escalationApproverRoles,
    ]);

    return withEvent({
        ...request,
        status: 'ESCALATED',
        requiredApproverRoles,
        escalationLevel: request.escalationLevel + 1,
        dueAt: addHours(now, Math.max(1, Math.ceil(workflowPolicy.slaHours / 2))).toISOString(),
        updatedAt: createdAt,
    }, {
        eventType: 'ESCALATED',
        fromStatus: request.status,
        toStatus: 'ESCALATED',
        actorUserId: input.actor?.userId,
        actorRole: input.actor?.role,
        reason: input.reason,
        metadata: {
            escalationLevel: request.escalationLevel + 1,
            requiredApproverRoles,
        },
        createdAt,
    });
}

export function expireWorkflowApprovalRequest(
    request: WorkflowApprovalRequest,
    now: Date = new Date(),
): WorkflowApprovalRequest {
    assertReviewable(request);

    if (now.getTime() < Date.parse(request.expiresAt)) {
        throw new Error('Approval request has not reached its expiry time.');
    }

    const createdAt = now.toISOString();
    return withEvent({
        ...request,
        status: 'EXPIRED',
        updatedAt: createdAt,
        completedAt: createdAt,
    }, {
        eventType: 'EXPIRED',
        fromStatus: request.status,
        toStatus: 'EXPIRED',
        createdAt,
    });
}

export function cancelWorkflowApprovalRequest(
    request: WorkflowApprovalRequest,
    input: CancelWorkflowApprovalInput,
): WorkflowApprovalRequest {
    assertReviewable(request);
    assertActorTenant(request, input.actor);

    if (!input.reason.trim()) {
        throw new Error('Cancellation reason is required.');
    }

    const now = input.now ?? new Date();
    const createdAt = now.toISOString();

    return withEvent({
        ...request,
        status: 'CANCELLED',
        updatedAt: createdAt,
        completedAt: createdAt,
    }, {
        eventType: 'CANCELLED',
        fromStatus: request.status,
        toStatus: 'CANCELLED',
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        reason: input.reason,
        createdAt,
    });
}

export function toWorkflowApprovalQueueItem(
    request: WorkflowApprovalRequest,
    now: Date = new Date(),
): WorkflowApprovalQueueItem {
    return {
        id: request.id,
        tenantId: request.tenantId,
        policyId: request.policyId,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        resourceType: request.resource.type,
        resourceId: request.resource.id,
        requestedByUserId: request.requestedByUserId,
        requiredApproverRoles: request.requiredApproverRoles,
        approvalsReceived: countApprovals(request.reviews),
        approvalsRequired: request.minApprovals,
        dueAt: request.dueAt,
        expiresAt: request.expiresAt,
        isOverdue: !TERMINAL_STATUSES.has(request.status) && now.getTime() > Date.parse(request.dueAt),
    };
}

export function canActorReviewWorkflowApproval(
    request: WorkflowApprovalRequest,
    actor: WorkflowApprovalActor,
): boolean {
    try {
        assertReviewable(request);
        assertActorTenant(request, actor);
        assertEligibleApprover(request, actor);
        assertNotDuplicateReviewer(request, actor.userId);
        if (!request.allowRequesterApproval && actor.userId === request.requestedByUserId) return false;
        return true;
    } catch {
        return false;
    }
}

export function countApprovals(reviews: readonly WorkflowApprovalReview[]): number {
    return reviews.filter((review) => review.decision === 'APPROVED').length;
}

export function countRejections(reviews: readonly WorkflowApprovalReview[]): number {
    return reviews.filter((review) => review.decision === 'REJECTED').length;
}

function resolveStatusAfterReview(
    request: WorkflowApprovalRequest,
    reviews: readonly WorkflowApprovalReview[],
    lastDecision: 'APPROVED' | 'REJECTED',
): WorkflowApprovalStatus {
    if (lastDecision === 'REJECTED') return 'REJECTED';
    if (countApprovals(reviews) >= request.minApprovals) return 'APPROVED';
    return request.status === 'ESCALATED' ? 'ESCALATED' : 'PENDING';
}

function assertReviewable(request: WorkflowApprovalRequest): void {
    if (TERMINAL_STATUSES.has(request.status)) {
        throw new Error(`Approval request is already ${request.status}.`);
    }
}

function assertSameTenant(actor: WorkflowApprovalActor, resource: WorkflowApprovalResource): void {
    if (actor.tenantId !== resource.tenantId) {
        throw new Error('Approval requester and resource tenant must match.');
    }
}

function assertActorTenant(request: WorkflowApprovalRequest, actor: WorkflowApprovalActor): void {
    if (actor.tenantId !== request.tenantId) {
        throw new Error('Approval actor tenant does not match request tenant.');
    }
}

function assertEligibleApprover(request: WorkflowApprovalRequest, actor: WorkflowApprovalActor): void {
    const rolesToCheck = [actor.role, actor.delegatedFromRole].filter(Boolean) as AuthorizationRole[];
    if (!rolesToCheck.some((role) => request.requiredApproverRoles.includes(role))) {
        throw new Error(`Role ${actor.role} is not eligible to review ${request.policyId}.`);
    }
}

function assertNotDuplicateReviewer(request: WorkflowApprovalRequest, actorUserId: string): void {
    if (request.reviews.some((review) => review.actorUserId === actorUserId)) {
        throw new Error('Reviewer has already reviewed this approval request.');
    }
}

function withEvent(
    request: WorkflowApprovalRequest,
    event: Omit<WorkflowApprovalEvent, 'id'>,
): WorkflowApprovalRequest {
    return {
        ...request,
        events: [
            ...request.events,
            {
                id: createEventId(request.id, event.eventType, event.createdAt),
                ...event,
            },
        ],
    };
}

function createStableApprovalId(policyId: string, resource: WorkflowApprovalResource, createdAt: string): string {
    return `approval_${slug(policyId)}_${slug(resource.type)}_${slug(resource.id ?? createdAt)}`;
}

function createReviewId(requestId: string, actorUserId: string, createdAt: string): string {
    return `review_${slug(requestId)}_${slug(actorUserId)}_${Date.parse(createdAt)}`;
}

function createEventId(requestId: string, eventType: WorkflowApprovalEventType, createdAt: string): string {
    return `event_${slug(requestId)}_${eventType.toLowerCase()}_${Date.parse(createdAt)}`;
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'item';
}

function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function priorityForPolicy(policyId: string): 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' {
    if (policyId === 'data.export_pii' || policyId === 'users.role_change') return 'CRITICAL';
    if (policyId === 'payments.refund' || policyId.startsWith('fees.')) return 'HIGH';
    return 'NORMAL';
}

function uniqueRoles(roles: readonly AuthorizationRole[]): readonly AuthorizationRole[] {
    return Array.from(new Set(roles));
}
