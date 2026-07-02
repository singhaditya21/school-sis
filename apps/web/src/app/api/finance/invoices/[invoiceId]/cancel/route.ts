import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    cancelInvoiceWithApproval,
    FinanceApprovalExecutionError,
    financeResultHttpStatus,
} from '@/lib/finance/approval-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cancelSchema = z.object({
    reason: z.string().trim().min(3).max(1000),
    approvalRequestId: z.string().uuid().optional(),
});

type RouteContext = {
    params: Promise<{ invoiceId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('fees:approve');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = cancelSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid invoice cancellation request.' },
            { status: 400 },
        );
    }

    const { invoiceId } = await params;
    try {
        const result = await cancelInvoiceWithApproval({
            tenantId: auth.context.tenantId,
            invoiceId,
            reason: parsed.data.reason,
            approvalRequestId: parsed.data.approvalRequestId,
            actor: {
                userId: auth.context.userId,
                role: auth.context.role as AuthorizationRole,
                tenantId: auth.context.tenantId,
            },
        });

        return NextResponse.json(result, { status: financeResultHttpStatus(result) });
    } catch (error) {
        return financeErrorResponse(error, 'Failed to cancel invoice.');
    }
}

function financeErrorResponse(error: unknown, fallback: string) {
    if (error instanceof FinanceApprovalExecutionError || error instanceof WorkflowApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : fallback },
        { status: 500 },
    );
}
