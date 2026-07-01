import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import { requireApiAuth, requireBearerServiceAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { isValidTenantId } from '@/lib/tenant/isolation';
import { recordObservabilityEvent, recordSreIncident, requestContextFrom } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const incidentSchema = z.object({
  tenantId: z.string().uuid().optional(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  source: z.string().trim().min(2).max(120),
  fingerprint: z.string().trim().min(2).max(160),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function isPlatformRole(role: string): boolean {
  return ROLE_GROUPS.platform.includes(role as typeof ROLE_GROUPS.platform[number]);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
  if (auth.ok === false) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 50), 100));
  const platform = isPlatformRole(auth.context.role);

  const values: unknown[] = [];
  let where = 'WHERE 1 = 1';

  if (!platform) {
    values.push(auth.context.tenantId);
    where += ` AND tenant_id = $${values.length}`;
  }

  if (status) {
    values.push(status.toUpperCase());
    where += ` AND status = $${values.length}`;
  }

  values.push(limit);
  const limitParam = values.length;

  const load = async () => pool.query(
    `SELECT id,
            tenant_id AS "tenantId",
            scope,
            severity,
            status,
            source,
            fingerprint,
            title,
            description,
            occurrence_count AS "occurrenceCount",
            first_seen_at AS "firstSeenAt",
            last_seen_at AS "lastSeenAt",
            acknowledged_at AS "acknowledgedAt",
            resolved_at AS "resolvedAt",
            metadata,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM sre_incidents
     ${where}
     ORDER BY
       CASE severity
         WHEN 'CRITICAL' THEN 1
         WHEN 'ERROR' THEN 2
         WHEN 'WARNING' THEN 3
         ELSE 4
       END,
       last_seen_at DESC
     LIMIT $${limitParam}`,
    values,
  );

  const result = platform
    ? await runWithRlsBypass(load)
    : await runWithTenantContext(auth.context.tenantId, load);

  return NextResponse.json({ incidents: result.rows });
}

export async function POST(request: Request) {
  const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
    serviceName: 'SRE incident ingest',
    required: process.env.NODE_ENV === 'production',
  });
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = incidentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid incident payload' }, { status: 400 });
  }

  const tenantId = parsed.data.tenantId || null;
  if (tenantId && !isValidTenantId(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 });
  }

  const requestContext = requestContextFrom(request);
  await recordSreIncident({
    tenantId,
    severity: parsed.data.severity,
    source: parsed.data.source,
    fingerprint: parsed.data.fingerprint,
    title: parsed.data.title,
    description: parsed.data.description,
    requestId: requestContext.requestId,
    traceId: requestContext.traceId,
    metadata: parsed.data.metadata || {},
  });

  await recordObservabilityEvent({
    tenantId,
    severity: parsed.data.severity === 'CRITICAL' ? 'CRITICAL' : parsed.data.severity,
    source: parsed.data.source,
    eventType: 'sre.incident.ingested',
    message: parsed.data.title,
    requestId: requestContext.requestId,
    traceId: requestContext.traceId,
    entityType: 'sre_incident',
    entityId: parsed.data.fingerprint,
    metadata: parsed.data.metadata || {},
  });

  return NextResponse.json({ success: true }, { status: 202 });
}
