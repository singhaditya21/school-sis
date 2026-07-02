import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { isValidTenantId } from '@/lib/tenant/isolation';
import {
  assertBiExportAllowed,
  buildBiCatalogSnapshot,
  validateBiQueryRequest,
  type BiScope,
} from '../../../../../../../packages/api/src/analytics/bi';
import {
  requireApprovedWorkflowApprovalOrRequest,
  toWorkflowApprovalSummary,
  WorkflowApprovalError,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const filterSchema = z.object({
  dimensionId: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'in', 'gte', 'lte', 'between']),
  value: z.unknown(),
});

const dateRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const querySchema = z.object({
  action: z.literal('validate_query').default('validate_query'),
  datasetId: z.string().min(1),
  scope: z.enum(['TENANT', 'PLATFORM']).optional(),
  tenantId: z.string().uuid().optional(),
  metricIds: z.array(z.string().min(1)).min(1),
  dimensionIds: z.array(z.string().min(1)).optional(),
  filters: z.array(filterSchema).optional(),
  dateRange: dateRangeSchema.optional(),
  limit: z.number().int().positive().optional(),
});

const exportSchema = querySchema.extend({
  action: z.literal('validate_export'),
  exportPolicyId: z.string().min(1),
  format: z.enum(['csv', 'xlsx', 'json']),
  reason: z.string().optional(),
  approvalRequestId: z.string().uuid().optional(),
});

function resolveScope(role: string, requestedScope?: string | null): BiScope {
  return role === 'PLATFORM_ADMIN' && requestedScope === 'PLATFORM' ? 'PLATFORM' : 'TENANT';
}

function resolveTenantId(role: string, sessionTenantId: string, requestedTenantId: string | undefined, scope: BiScope) {
  if (scope === 'PLATFORM') return undefined;
  return role === 'PLATFORM_ADMIN' ? requestedTenantId ?? sessionTenantId : sessionTenantId;
}

function normalizeDateRange(dateRange: { from?: string; to?: string } | undefined) {
  return dateRange?.from && dateRange?.to
    ? { from: dateRange.from, to: dateRange.to }
    : undefined;
}

function buildExportApprovalPayload(requested: z.infer<typeof exportSchema>, scope: BiScope, tenantId: string | undefined) {
  return {
    exportPolicyId: requested.exportPolicyId,
    format: requested.format,
    scope,
    tenantId,
    datasetId: requested.datasetId,
    metricIds: requested.metricIds,
    dimensionIds: requested.dimensionIds ?? [],
    filters: requested.filters ?? [],
    dateRange: normalizeDateRange(requested.dateRange),
    limit: requested.limit,
    reason: requested.reason,
  };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;

  const url = new URL(request.url);
  const scope = resolveScope(auth.context.role, url.searchParams.get('scope')?.toUpperCase());
  const requestedTenantId = url.searchParams.get('tenantId') || undefined;
  const tenantId = resolveTenantId(auth.context.role, auth.context.tenantId, requestedTenantId, scope);

  if (scope === 'TENANT' && (!tenantId || !isValidTenantId(tenantId))) {
    return NextResponse.json({ error: 'A valid tenantId is required for tenant-scoped BI catalog access.' }, { status: 400 });
  }

  const snapshot = buildBiCatalogSnapshot(auth.context, scope, tenantId);
  return NextResponse.json({ snapshot }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = typeof body === 'object' && body && 'action' in body ? (body as { action?: unknown }).action : 'validate_query';
  if (action === 'validate_export') {
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid BI export request' }, { status: 400 });
    }

    const requested = parsed.data;
    const scope = resolveScope(auth.context.role, requested.scope);
    const tenantId = resolveTenantId(auth.context.role, auth.context.tenantId, requested.tenantId, scope);

    if (scope === 'TENANT' && (!tenantId || !isValidTenantId(tenantId))) {
      return NextResponse.json({ error: 'A valid tenantId is required for tenant-scoped BI requests.' }, { status: 400 });
    }

    try {
      const validation = assertBiExportAllowed(auth.context, {
        exportPolicyId: requested.exportPolicyId!,
        format: requested.format!,
        scope,
        tenantId,
        datasetId: requested.datasetId!,
        metricIds: requested.metricIds ?? [],
        dimensionIds: requested.dimensionIds ?? [],
        filters: requested.filters?.map((filter) => ({
          dimensionId: filter.dimensionId!,
          operator: filter.operator!,
          value: filter.value,
        })) ?? [],
        dateRange: normalizeDateRange(requested.dateRange),
        limit: requested.limit,
        reason: requested.reason,
      });

      if (validation.approvalPolicyId) {
        if (!tenantId) {
          return NextResponse.json({ error: 'Tenant-scoped approval is required for sensitive exports.' }, { status: 400 });
        }

        const approval = await requireApprovedWorkflowApprovalOrRequest({
          approvalRequestId: requested.approvalRequestId,
          policyId: validation.approvalPolicyId,
          tenantId,
          title: `Approve ${requested.exportPolicyId} export`,
          description: 'Sensitive BI export requires workflow approval before release.',
          resource: {
            type: 'bi_export',
            id: requested.exportPolicyId,
            tenantId,
          },
          payload: buildExportApprovalPayload(requested, scope, tenantId),
          reason: requested.reason,
          requestedBy: {
            userId: auth.context.userId,
            role: auth.context.role as AuthorizationRole,
            tenantId,
          },
        });

        if (!approval.approved) {
          return NextResponse.json({
            approvalRequired: true,
            approval: toWorkflowApprovalSummary(approval.request),
            validation,
          }, { status: 202 });
        }

        return NextResponse.json({
          validation: {
            ...validation,
            approvalRequestId: approval.request.id,
            approved: true,
          },
        });
      }

      return NextResponse.json({ validation });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'BI export request denied' },
        { status: error instanceof WorkflowApprovalError ? error.status : 403 },
      );
    }
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid BI query request' }, { status: 400 });
  }

  const requested = parsed.data;
  const scope = resolveScope(auth.context.role, requested.scope);
  const tenantId = resolveTenantId(auth.context.role, auth.context.tenantId, requested.tenantId, scope);

  if (scope === 'TENANT' && (!tenantId || !isValidTenantId(tenantId))) {
    return NextResponse.json({ error: 'A valid tenantId is required for tenant-scoped BI requests.' }, { status: 400 });
  }

  try {
    const validation = validateBiQueryRequest(auth.context, {
      scope,
      tenantId,
      datasetId: requested.datasetId!,
      metricIds: requested.metricIds ?? [],
      dimensionIds: requested.dimensionIds ?? [],
      filters: requested.filters?.map((filter) => ({
        dimensionId: filter.dimensionId!,
        operator: filter.operator!,
        value: filter.value,
      })) ?? [],
      dateRange: normalizeDateRange(requested.dateRange),
      limit: requested.limit,
    });

    return NextResponse.json({ validation }, { status: validation.valid ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'BI request denied' }, { status: 403 });
  }
}
