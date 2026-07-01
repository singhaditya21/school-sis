import crypto from 'crypto';
import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import { isValidTenantId } from '@/lib/tenant/isolation';

export type ObservabilitySeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type SreIncidentSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type ObservabilityScope = 'TENANT' | 'PLATFORM';

export type ObservabilityContext = {
  tenantId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  actorUserId?: string | null;
  source?: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecordObservabilityEventInput = ObservabilityContext & {
  severity: ObservabilitySeverity;
  eventType: string;
  message: string;
};

export type RecordSreIncidentInput = ObservabilityContext & {
  severity: SreIncidentSeverity;
  source: string;
  fingerprint: string;
  title: string;
  description?: string | null;
};

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'token',
  'secret',
  'apiKey',
  'privateKey',
  'session',
]);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key) || [...SENSITIVE_KEYS].some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      output[key] = '[Redacted]';
      continue;
    }
    output[key] = sanitizeValue(child, depth + 1);
  }
  return output;
}

export function requestContextFrom(request: Request): Pick<ObservabilityContext, 'requestId' | 'traceId'> {
  const traceparent = request.headers.get('traceparent');
  return {
    requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
    traceId: traceparent?.split('-')[1] || request.headers.get('x-trace-id') || null,
  };
}

function emitLog(level: ObservabilitySeverity, eventType: string, message: string, context: ObservabilityContext = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event: eventType,
    message,
    tenantId: context.tenantId || undefined,
    requestId: context.requestId || undefined,
    traceId: context.traceId || undefined,
    actorUserId: context.actorUserId || undefined,
    source: context.source || 'web',
    entityType: context.entityType || undefined,
    entityId: context.entityId || undefined,
    metadata: sanitizeValue(context.metadata || {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(line);
  } else if (level === 'WARNING') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (eventType: string, message: string, context?: ObservabilityContext) => emitLog('DEBUG', eventType, message, context),
  info: (eventType: string, message: string, context?: ObservabilityContext) => emitLog('INFO', eventType, message, context),
  warn: (eventType: string, message: string, context?: ObservabilityContext) => emitLog('WARNING', eventType, message, context),
  error: (eventType: string, message: string, context?: ObservabilityContext) => emitLog('ERROR', eventType, message, context),
  critical: (eventType: string, message: string, context?: ObservabilityContext) => emitLog('CRITICAL', eventType, message, context),
};

export async function recordObservabilityEvent(input: RecordObservabilityEventInput): Promise<void> {
  const tenantId = input.tenantId || null;
  const scope: ObservabilityScope = tenantId ? 'TENANT' : 'PLATFORM';
  const insert = async () => {
    await pool.query(
      `INSERT INTO observability_events (
          tenant_id, scope, severity, source, event_type, message, request_id, trace_id,
          actor_user_id, entity_type, entity_id, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        tenantId,
        scope,
        input.severity,
        input.source || 'web',
        input.eventType,
        input.message,
        input.requestId || null,
        input.traceId || null,
        input.actorUserId || null,
        input.entityType || null,
        input.entityId || null,
        JSON.stringify(sanitizeValue(input.metadata || {})),
      ],
    );
  };

  try {
    if (tenantId && isValidTenantId(tenantId)) {
      await runWithTenantContext(tenantId, insert);
    } else {
      await runWithRlsBypass(insert);
    }
  } catch (error) {
    logger.warn('observability.event_write_failed', 'Failed to write observability event', {
      source: 'observability',
      metadata: { error: error instanceof Error ? error.message : String(error), eventType: input.eventType },
    });
  }
}

export async function recordSreIncident(input: RecordSreIncidentInput): Promise<void> {
  const tenantId = input.tenantId || null;
  const scope: ObservabilityScope = tenantId ? 'TENANT' : 'PLATFORM';
  const conflictTarget = tenantId
    ? '(tenant_id, fingerprint) WHERE tenant_id IS NOT NULL'
    : '(fingerprint) WHERE tenant_id IS NULL';
  const write = async () => {
    await pool.query(
      `INSERT INTO sre_incidents (
          tenant_id, scope, severity, status, source, fingerprint, title, description, metadata
       )
       VALUES ($1, $2, $3, 'OPEN', $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET
          severity = EXCLUDED.severity,
          status = CASE
            WHEN sre_incidents.status = 'RESOLVED' THEN 'OPEN'
            ELSE sre_incidents.status
          END,
          title = EXCLUDED.title,
          description = COALESCE(EXCLUDED.description, sre_incidents.description),
          occurrence_count = sre_incidents.occurrence_count + 1,
          last_seen_at = NOW(),
          metadata = sre_incidents.metadata || EXCLUDED.metadata,
          updated_at = NOW()`,
      [
        tenantId,
        scope,
        input.severity,
        input.source,
        input.fingerprint,
        input.title,
        input.description || null,
        JSON.stringify(sanitizeValue(input.metadata || {})),
      ],
    );
  };

  try {
    if (tenantId && isValidTenantId(tenantId)) {
      await runWithTenantContext(tenantId, write);
    } else {
      await runWithRlsBypass(write);
    }
    logger.warn('sre.incident_recorded', input.title, {
      tenantId,
      source: input.source,
      entityType: 'sre_incident',
      entityId: input.fingerprint,
      metadata: { severity: input.severity },
    });
  } catch (error) {
    logger.error('sre.incident_write_failed', 'Failed to write SRE incident', {
      source: 'observability',
      metadata: { error: error instanceof Error ? error.message : String(error), fingerprint: input.fingerprint },
    });
  }
}
