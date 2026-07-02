import type { ApprovalPolicy, AuthorizationRole } from '../../authorization';

export type WorkflowApprovalStatus =
    | 'PENDING'
    | 'ESCALATED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';

export type WorkflowApprovalDecision = 'APPROVED' | 'REJECTED';

export type WorkflowApprovalPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type WorkflowApprovalEventType =
    | 'REQUESTED'
    | 'REVIEWED'
    | 'APPROVED'
    | 'REJECTED'
    | 'ESCALATED'
    | 'CANCELLED'
    | 'EXPIRED';

export interface WorkflowApprovalActor {
    userId: string;
    role: AuthorizationRole;
    tenantId: string;
    delegatedFromUserId?: string;
    delegatedFromRole?: AuthorizationRole;
}

export interface WorkflowApprovalResource {
    type: string;
    id?: string;
    tenantId: string;
    label?: string;
}

export interface WorkflowApprovalReview {
    id: string;
    actorUserId: string;
    actorRole: AuthorizationRole;
    decision: WorkflowApprovalDecision;
    reason?: string;
    delegatedFromUserId?: string;
    createdAt: string;
}

export interface WorkflowApprovalEvent {
    id: string;
    eventType: WorkflowApprovalEventType;
    fromStatus?: WorkflowApprovalStatus;
    toStatus: WorkflowApprovalStatus;
    actorUserId?: string;
    actorRole?: AuthorizationRole;
    reason?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

export interface WorkflowApprovalRequest {
    id: string;
    tenantId: string;
    policyId: string;
    policy: ApprovalPolicy;
    title: string;
    description: string;
    priority: WorkflowApprovalPriority;
    status: WorkflowApprovalStatus;
    resource: WorkflowApprovalResource;
    payload: Record<string, unknown>;
    requestedByUserId: string;
    requestedByRole: AuthorizationRole;
    requiredApproverRoles: readonly AuthorizationRole[];
    minApprovals: number;
    allowRequesterApproval: boolean;
    escalationLevel: number;
    dueAt: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    reviews: readonly WorkflowApprovalReview[];
    events: readonly WorkflowApprovalEvent[];
}

export interface ApprovalWorkflowPolicy {
    policy: ApprovalPolicy;
    slaHours: number;
    expiryHours: number;
    escalationApproverRoles: readonly AuthorizationRole[];
    allowRequesterApproval: boolean;
    notificationChannels: readonly ('IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP')[];
}

export interface CreateWorkflowApprovalInput {
    id?: string;
    policyId: string;
    tenantId: string;
    title?: string;
    description?: string;
    priority?: WorkflowApprovalPriority;
    resource: WorkflowApprovalResource;
    payload?: Record<string, unknown>;
    requestedBy: WorkflowApprovalActor;
    now?: Date;
}

export interface ReviewWorkflowApprovalInput {
    actor: WorkflowApprovalActor;
    decision: WorkflowApprovalDecision;
    reason?: string;
    now?: Date;
    reviewId?: string;
}

export interface CancelWorkflowApprovalInput {
    actor: WorkflowApprovalActor;
    reason: string;
    now?: Date;
}

export interface EscalateWorkflowApprovalInput {
    actor?: WorkflowApprovalActor;
    reason?: string;
    now?: Date;
}

export interface WorkflowApprovalQueueItem {
    id: string;
    tenantId: string;
    policyId: string;
    title: string;
    priority: WorkflowApprovalPriority;
    status: WorkflowApprovalStatus;
    resourceType: string;
    resourceId?: string;
    requestedByUserId: string;
    requiredApproverRoles: readonly AuthorizationRole[];
    approvalsReceived: number;
    approvalsRequired: number;
    dueAt: string;
    expiresAt: string;
    isOverdue: boolean;
}
