import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    reviewPersistedWorkflowApprovalRequest,
    toWorkflowApprovalSummary,
    WorkflowApprovalError,
    type AuthorizationRole,
    type WorkflowApprovalActor,
    type WorkflowApprovalSummary,
} from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const reviewSchema = z.object({
    action: z.enum(['APPROVED', 'REJECTED']).optional(),
    decision: z.enum(['APPROVED', 'REJECTED']).optional(),
    reason: z.string().trim().max(1000).optional(),
}).refine((value) => Boolean(value.action || value.decision), {
    message: 'Review decision is required.',
});

type RouteContext = {
    params: Promise<{ approvalId: string }>;
};

function actorFromAuth(auth: { userId: string; role: string; tenantId: string }): WorkflowApprovalActor {
    return {
        userId: auth.userId,
        role: auth.role as AuthorizationRole,
        tenantId: auth.tenantId,
    };
}

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('agents:approve');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = reviewSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid agent approval review request.' },
            { status: 400 },
        );
    }

    const { approvalId } = await params;
    try {
        const approval = await reviewPersistedWorkflowApprovalRequest({
            tenantId: auth.context.tenantId,
            approvalRequestId: approvalId,
            actor: actorFromAuth(auth.context),
            decision: parsed.data.decision || parsed.data.action!,
            reason: parsed.data.reason,
        });
        const summary = toWorkflowApprovalSummary(approval);

        return NextResponse.json({
            approval: toLegacyAgentApproval(summary),
            workflowApproval: summary,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to review agent approval.' },
            { status: error instanceof WorkflowApprovalError ? error.status : 400 },
        );
    }
}

function toLegacyAgentApproval(summary: WorkflowApprovalSummary): Record<string, unknown> {
    return {
        id: summary.id,
        policy_id: summary.policyId,
        agent_name: summary.resourceId || 'agent',
        title: summary.title,
        description: summary.description,
        proposed_action: {
            resourceType: summary.resourceType,
            resourceId: summary.resourceId,
            policyId: summary.policyId,
        },
        priority: summary.priority,
        status: summary.status,
        approvals_received: summary.approvalsReceived,
        approvals_required: summary.approvalsRequired,
        completed_at: summary.completedAt,
        updated_at: summary.updatedAt,
    };
}
