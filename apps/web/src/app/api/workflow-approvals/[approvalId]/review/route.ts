import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
  reviewPersistedWorkflowApprovalRequest,
  toWorkflowApprovalSummary,
  WorkflowApprovalError,
  type WorkflowApprovalActor,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().max(1000).optional(),
});

function actorFromAuth(auth: { userId: string; role: string; tenantId: string }): WorkflowApprovalActor {
  return {
    userId: auth.userId,
    role: auth.role as AuthorizationRole,
    tenantId: auth.tenantId,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;

  const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
  if (json.ok === false) return json.response;

  const parsed = reviewSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Invalid approval review request.' },
      { status: 400 },
    );
  }

  const { approvalId } = await params;
  try {
    const approval = await reviewPersistedWorkflowApprovalRequest({
      tenantId: auth.context.tenantId,
      approvalRequestId: approvalId,
      actor: actorFromAuth(auth.context),
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ approval: toWorkflowApprovalSummary(approval) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review workflow approval.' },
      { status: error instanceof WorkflowApprovalError ? error.status : 400 },
    );
  }
}
