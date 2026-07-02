import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    WorkflowAdoptionExecutionError,
    transferStudentWithApproval,
    workflowAdoptionHttpStatus,
} from '@/lib/workflows/adoption-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const transferSchema = z.object({
    reason: z.string().trim().min(3).max(1000),
    approvalRequestId: z.string().uuid().optional(),
    effectiveDate: z.string().trim().max(40).optional(),
    destination: z.string().trim().max(255).optional(),
    note: z.string().trim().max(1000).optional(),
});

type RouteContext = {
    params: Promise<{ studentId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('students:update');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = transferSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid student transfer request.' },
            { status: 400 },
        );
    }

    const { studentId } = await params;
    try {
        const result = await transferStudentWithApproval({
            tenantId: auth.context.tenantId,
            studentId,
            reason: parsed.data.reason,
            approvalRequestId: parsed.data.approvalRequestId,
            details: {
                effectiveDate: parsed.data.effectiveDate,
                destination: parsed.data.destination,
                note: parsed.data.note,
            },
            actor: {
                userId: auth.context.userId,
                role: auth.context.role as AuthorizationRole,
                tenantId: auth.context.tenantId,
            },
        });

        return NextResponse.json(result, { status: workflowAdoptionHttpStatus(result) });
    } catch (error) {
        return workflowAdoptionErrorResponse(error, 'Failed to transfer student.');
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
