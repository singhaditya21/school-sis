import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    WorkflowAdoptionExecutionError,
    changeUserRoleWithApproval,
    workflowAdoptionHttpStatus,
} from '@/lib/workflows/adoption-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const roleChangeSchema = z.object({
    targetRole: z.string().min(1).max(80),
    reason: z.string().trim().min(3).max(1000),
    approvalRequestId: z.string().uuid().optional(),
});

type RouteContext = {
    params: Promise<{ userId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('settings:write');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = roleChangeSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid role change request.' },
            { status: 400 },
        );
    }

    const { userId } = await params;
    try {
        const result = await changeUserRoleWithApproval({
            tenantId: auth.context.tenantId,
            userId,
            targetRole: parsed.data.targetRole,
            reason: parsed.data.reason,
            approvalRequestId: parsed.data.approvalRequestId,
            actor: {
                userId: auth.context.userId,
                role: auth.context.role as AuthorizationRole,
                tenantId: auth.context.tenantId,
            },
        });

        return NextResponse.json(result, { status: workflowAdoptionHttpStatus(result) });
    } catch (error) {
        return workflowAdoptionErrorResponse(error, 'Failed to change user role.');
    }
}

function workflowAdoptionErrorResponse(error: unknown, fallback: string) {
    if (error instanceof WorkflowAdoptionExecutionError || error instanceof WorkflowApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : fallback },
        { status: 500 },
    );
}
