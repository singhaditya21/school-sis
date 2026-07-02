import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    createPersistedWorkflowApprovalRequest,
    listWorkflowApprovalRequests,
    toWorkflowApprovalSummary,
    WorkflowApprovalError,
    type AuthorizationRole,
    type WorkflowApprovalActor,
    type WorkflowApprovalSummary,
} from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AGENT_APPROVAL_POLICY_ID = 'agents.approval.review';

const createAgentApprovalSchema = z.object({
    agentName: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(1000),
    proposedAction: z.record(z.unknown()),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
    resourceId: z.string().trim().max(160).optional(),
    reason: z.string().trim().min(3).max(1000),
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

const statusSchema = z.enum(['PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']);

function actorFromAuth(auth: { userId: string; role: string; tenantId: string }): WorkflowApprovalActor {
    return {
        userId: auth.userId,
        role: auth.role as AuthorizationRole,
        tenantId: auth.tenantId,
    };
}

export async function GET(request: Request) {
    const auth = await requireApiPermission('agents:approve');
    if (auth.ok === false) return auth.response;

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') || undefined;
    const status = statusParam ? statusSchema.safeParse(statusParam) : undefined;
    if (status && !status.success) {
        return NextResponse.json({ error: 'Invalid approval status.' }, { status: 400 });
    }

    try {
        const requests = await listWorkflowApprovalRequests({
            tenantId: auth.context.tenantId,
            status: status?.data,
            policyId: AGENT_APPROVAL_POLICY_ID,
            viewer: actorFromAuth(auth.context),
            limit: Number(url.searchParams.get('limit') || 50),
        });
        const approvals = requests.map(toWorkflowApprovalSummary);

        return NextResponse.json({
            approvals: approvals.map(toLegacyAgentApproval),
            workflowApprovals: approvals,
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list agent approvals.' },
            { status: error instanceof WorkflowApprovalError ? error.status : 500 },
        );
    }
}

export async function POST(request: Request) {
    const auth = await requireApiPermission('agents:approve');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = createAgentApprovalSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid agent approval request.' },
            { status: 400 },
        );
    }

    try {
        const approval = await createPersistedWorkflowApprovalRequest({
            policyId: AGENT_APPROVAL_POLICY_ID,
            tenantId: auth.context.tenantId,
            title: parsed.data.title,
            description: parsed.data.description,
            priority: parsed.data.priority ?? 'HIGH',
            resource: {
                type: 'agents.action',
                id: parsed.data.resourceId || parsed.data.agentName,
                label: parsed.data.agentName,
                tenantId: auth.context.tenantId,
            },
            payload: {
                action: 'REVIEW_AGENT_ACTION',
                agentName: parsed.data.agentName,
                proposedAction: parsed.data.proposedAction,
            },
            reason: parsed.data.reason,
            idempotencyKey: parsed.data.idempotencyKey,
            requestedBy: actorFromAuth(auth.context),
        });
        const summary = toWorkflowApprovalSummary(approval);

        return NextResponse.json(
            { approval: toLegacyAgentApproval(summary), workflowApproval: summary },
            { status: approval.status === 'APPROVED' ? 200 : 202 },
        );
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create agent approval.' },
            { status: error instanceof WorkflowApprovalError ? error.status : 500 },
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
        created_at: summary.createdAt,
        due_at: summary.dueAt,
        expires_at: summary.expiresAt,
    };
}
