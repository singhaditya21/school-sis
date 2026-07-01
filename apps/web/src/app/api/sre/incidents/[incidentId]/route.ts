import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { QueryResult } from 'pg';
import { pool, runWithRlsBypass } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { recordObservabilityEvent, requestContextFrom } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const updateSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const auth = await requireApiAuth(ROLE_GROUPS.platform);
  if (auth.ok === false) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid incident update' }, { status: 400 });
  }

  const { incidentId } = await params;
  const fieldSql = parsed.data.status === 'ACKNOWLEDGED'
    ? 'acknowledged_by = $2, acknowledged_at = NOW(), resolved_by = NULL, resolved_at = NULL'
    : 'resolved_by = $2, resolved_at = NOW()';

  const result = await runWithRlsBypass<QueryResult<{
    id: string;
    tenantId: string | null;
    fingerprint: string;
    title: string;
    status: string;
  }>>(() => pool.query(
    `UPDATE sre_incidents
     SET status = $1,
         ${fieldSql},
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, tenant_id AS "tenantId", fingerprint, title, status`,
    [parsed.data.status, auth.context.userId, incidentId],
  ));

  if (!result.rows[0]) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  const requestContext = requestContextFrom(request);
  await recordObservabilityEvent({
    severity: 'INFO',
    source: 'sre',
    eventType: 'sre.incident.status_changed',
    message: `Incident ${parsed.data.status.toLowerCase()}`,
    requestId: requestContext.requestId,
    traceId: requestContext.traceId,
    actorUserId: auth.context.userId,
    entityType: 'sre_incident',
    entityId: incidentId,
    metadata: {
      status: parsed.data.status,
      fingerprint: result.rows[0].fingerprint,
    },
  });

  return NextResponse.json({ incident: result.rows[0] });
}
