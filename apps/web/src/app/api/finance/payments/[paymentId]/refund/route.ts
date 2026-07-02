import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    FinanceApprovalExecutionError,
    financeResultHttpStatus,
    refundPaymentWithApproval,
} from '@/lib/finance/approval-execution';
import { WorkflowApprovalError, type AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const refundSchema = z.object({
    reason: z.string().trim().min(3).max(1000),
    approvalRequestId: z.string().uuid().optional(),
    amount: z.number().positive().optional(),
});

type RouteContext = {
    params: Promise<{ paymentId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
    const auth = await requireApiPermission('payments:refund');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = refundSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid payment refund request.' },
            { status: 400 },
        );
    }

    const { paymentId } = await params;
    try {
        const result = await refundPaymentWithApproval({
            tenantId: auth.context.tenantId,
            paymentId,
            reason: parsed.data.reason,
            approvalRequestId: parsed.data.approvalRequestId,
            refundAmount: parsed.data.amount,
            actor: {
                userId: auth.context.userId,
                role: auth.context.role as AuthorizationRole,
                tenantId: auth.context.tenantId,
            },
        });

        return NextResponse.json(result, { status: financeResultHttpStatus(result) });
    } catch (error) {
        return financeErrorResponse(error, 'Failed to refund payment.');
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
