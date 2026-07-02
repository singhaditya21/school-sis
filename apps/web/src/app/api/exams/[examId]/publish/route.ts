import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    WorkflowAdoptionExecutionError,
    publishExamResultsWithApproval,
    workflowAdoptionHttpStatus,
} from '@/lib/workflows/adoption-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const publishSchema = z.object({
    reason: z.string().trim().max(1000).optional(),
    approvalRequestId: z.string().uuid().optional(),
});

type RouteContext = {
    params: Promise<{ examId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('exams:publish');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = publishSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid exam publication request.' },
            { status: 400 },
        );
    }

    const { examId } = await params;
    try {
        const result = await publishExamResultsWithApproval({
            tenantId: auth.context.tenantId,
            examId,
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
        return workflowAdoptionErrorResponse(error, 'Failed to publish exam results.');
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
