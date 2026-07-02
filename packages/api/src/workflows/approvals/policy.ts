import {
    AUTHORIZATION_APPROVAL_POLICIES,
    type ApprovalPolicy,
    type AuthorizationRole,
} from '../../authorization';
import type { ApprovalWorkflowPolicy } from './types';

const POLICY_OVERRIDES: Record<string, {
    slaHours: number;
    expiryHours: number;
    escalationApproverRoles: readonly AuthorizationRole[];
    allowRequesterApproval?: boolean;
}> = {
    'fees.invoice.waive': {
        slaHours: 8,
        expiryHours: 72,
        escalationApproverRoles: ['SUPER_ADMIN'],
    },
    'fees.invoice.cancel': {
        slaHours: 8,
        expiryHours: 72,
        escalationApproverRoles: ['SUPER_ADMIN'],
    },
    'payments.refund': {
        slaHours: 4,
        expiryHours: 48,
        escalationApproverRoles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    },
    'students.transfer': {
        slaHours: 12,
        expiryHours: 96,
        escalationApproverRoles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'],
    },
    'students.archive': {
        slaHours: 12,
        expiryHours: 96,
        escalationApproverRoles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'],
    },
    'exams.results.publish': {
        slaHours: 6,
        expiryHours: 48,
        escalationApproverRoles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'],
    },
    'users.role_change': {
        slaHours: 2,
        expiryHours: 24,
        escalationApproverRoles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    },
    'data.export_pii': {
        slaHours: 2,
        expiryHours: 24,
        escalationApproverRoles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    },
    'metadata.publish': {
        slaHours: 6,
        expiryHours: 48,
        escalationApproverRoles: ['SUPER_ADMIN'],
    },
    'agents.approval.review': {
        slaHours: 4,
        expiryHours: 24,
        escalationApproverRoles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    },
};

const DEFAULT_POLICY = {
    slaHours: 8,
    expiryHours: 72,
    escalationApproverRoles: ['SUPER_ADMIN'] as const,
};

export const APPROVAL_WORKFLOW_POLICIES = AUTHORIZATION_APPROVAL_POLICIES.map((policy) => {
    const override = POLICY_OVERRIDES[policy.id] ?? DEFAULT_POLICY;

    return {
        policy,
        slaHours: override.slaHours,
        expiryHours: Math.max(override.expiryHours, override.slaHours),
        escalationApproverRoles: override.escalationApproverRoles,
        allowRequesterApproval: override.allowRequesterApproval ?? false,
        notificationChannels: ['IN_APP', 'EMAIL'],
    };
}) as readonly ApprovalWorkflowPolicy[];

export function getApprovalWorkflowPolicy(policyId: string): ApprovalWorkflowPolicy | null {
    return APPROVAL_WORKFLOW_POLICIES.find((candidate) => candidate.policy.id === policyId) ?? null;
}

export function listApprovalWorkflowPolicies(): readonly ApprovalWorkflowPolicy[] {
    return APPROVAL_WORKFLOW_POLICIES;
}

export function requiredRolesForPolicy(policy: ApprovalPolicy): readonly AuthorizationRole[] {
    return policy.requiredApproverRoles;
}
