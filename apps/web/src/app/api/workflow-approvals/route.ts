import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
  createPersistedWorkflowApprovalRequest,
  listWorkflowApprovalRequests,
  toWorkflowApprovalSummary,
  WorkflowApprovalError,
  type WorkflowApprovalActor,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const resourceSchema = z.object({
  type: z.string().min(1).max(100),
  id: z.string().min(1).max(160).optional(),
  label: z.string().max(255).optional(),
});

const createSchema = z.object({
  policyId: z.string().min(1).max(120),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
  resource: resourceSchema,
  payload: z.record(z.unknown()).optional(),
  reason: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
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
  const auth = await requireApiAuth();
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
      policyId: url.searchParams.get('policyId') || undefined,
      resourceType: url.searchParams.get('resourceType') || undefined,
      resourceId: url.searchParams.get('resourceId') || undefined,
      viewer: actorFromAuth(auth.context),
      limit: Number(url.searchParams.get('limit') || 50),
    });

    return NextResponse.json({
      approvals: requests.map(toWorkflowApprovalSummary),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list workflow approvals.' },
      { status: error instanceof WorkflowApprovalError ? error.status : 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;

  const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
  if (json.ok === false) return json.response;

  const parsed = createSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Invalid workflow approval request.' },
      { status: 400 },
    );
  }

  try {
    const approval = await createPersistedWorkflowApprovalRequest({
      policyId: parsed.data.policyId,
      tenantId: auth.context.tenantId,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      resource: {
        type: parsed.data.resource.type,
        id: parsed.data.resource.id,
        label: parsed.data.resource.label,
        tenantId: auth.context.tenantId,
      },
      payload: parsed.data.payload,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
      requestedBy: actorFromAuth(auth.context),
    });

    return NextResponse.json(
      { approval: toWorkflowApprovalSummary(approval) },
      { status: approval.status === 'APPROVED' ? 200 : 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create workflow approval.' },
      { status: error instanceof WorkflowApprovalError ? error.status : 500 },
    );
  }
}
