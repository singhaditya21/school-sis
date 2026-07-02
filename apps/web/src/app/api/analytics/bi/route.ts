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
      return NextResponse.json({ validation });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'BI export request denied' }, { status: 403 });
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
