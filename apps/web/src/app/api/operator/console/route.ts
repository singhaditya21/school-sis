import { NextResponse } from 'next/server';
import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import { getDatabaseHealth } from '@/lib/observability/snapshot';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { isValidTenantId } from '@/lib/tenant/isolation';
import {
  buildOperatorConsoleSnapshot,
  calculateOperatorHealthScore,
  combineOperatorSeverity,
  filterOperatorTilesForContext,
  type OperatorConsoleMetrics,
  type OperatorConsoleScope,
} from '../../../../../../../packages/api/src/operations/operator-console';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CountRow = { count: string | number };

function firstCount(rows: CountRow[]): number {
  return Number(rows[0]?.count || 0);
}

async function count(sql: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<CountRow>(sql, values);
  return firstCount(result.rows);
}

function scopedWhere(scope: OperatorConsoleScope, tenantId: string | undefined, condition?: string): {
  where: string;
  values: unknown[];
} {
  if (scope === 'TENANT') {
    const values: unknown[] = [tenantId];
    return {
      where: condition ? `WHERE tenant_id = $1 AND (${condition})` : 'WHERE tenant_id = $1',
      values,
    };
  }

  return {
    where: condition ? `WHERE ${condition}` : '',
    values: [],
  };
}

async function collectOperatorConsoleMetrics(
  scope: OperatorConsoleScope,
  tenantId?: string,
): Promise<OperatorConsoleMetrics> {
  const database = await getDatabaseHealth();
  const run = scope === 'PLATFORM'
    ? runWithRlsBypass
    : <T>(fn: () => Promise<T>) => runWithTenantContext(tenantId!, fn);

  return run(async () => {
    const failedJobs = scopedWhere(scope, tenantId, "status = 'FAILED'");
    const deadJobs = scopedWhere(scope, tenantId, "status = 'DEAD_LETTER'");
    const queuedJobs = scopedWhere(scope, tenantId, "status IN ('QUEUED', 'SCHEDULED')");
    const staleJobs = scopedWhere(scope, tenantId, "status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes'");
    const failedNotifications = scopedWhere(scope, tenantId, "status = 'FAILED'");
    const deadNotifications = scopedWhere(scope, tenantId, "status = 'DEAD_LETTER'");
    const queuedNotifications = scopedWhere(scope, tenantId, "status IN ('PENDING', 'QUEUED')");
    const unreconciledOrders = scopedWhere(scope, tenantId, "status IN ('FAILED', 'REQUIRES_ACTION', 'CANCELLED')");
    const failedProviderEvents = scopedWhere(scope, tenantId, "status IN ('FAILED', 'ERROR')");
    const failingConnections = scopedWhere(scope, tenantId, "status IN ('FAILED', 'ERROR')");
    const failedIntegrationAudit = scopedWhere(scope, tenantId, "status IN ('FAILED', 'ERROR') AND created_at >= NOW() - INTERVAL '24 hours'");
    const expiredKeys = scopedWhere(scope, tenantId, "status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < NOW()");
    const pendingApprovals = scopedWhere(scope, tenantId, "status IN ('PENDING', 'ESCALATED')");
    const overdueApprovals = scopedWhere(scope, tenantId, "status IN ('PENDING', 'ESCALATED') AND due_at < NOW()");
    const escalatedApprovals = scopedWhere(scope, tenantId, "status = 'ESCALATED'");
    const openIncidents = scopedWhere(scope, tenantId, "status IN ('OPEN', 'ACKNOWLEDGED')");
    const criticalIncidents = scopedWhere(scope, tenantId, "status IN ('OPEN', 'ACKNOWLEDGED') AND severity = 'CRITICAL'");
    const acknowledgedIncidents = scopedWhere(scope, tenantId, "status = 'ACKNOWLEDGED'");
    const sloBreaches = scopedWhere(scope, tenantId, "window_end >= NOW() - INTERVAL '24 hours' AND status IN ('BREACHING', 'BREACHED')");
    const errorEvents = scopedWhere(scope, tenantId, "created_at >= NOW() - INTERVAL '24 hours' AND severity IN ('ERROR', 'CRITICAL')");
    const warningEvents = scopedWhere(scope, tenantId, "created_at >= NOW() - INTERVAL '24 hours' AND severity = 'WARNING'");
    const suspiciousEvents = scopedWhere(scope, tenantId, "created_at >= NOW() - INTERVAL '24 hours' AND source IN ('security', 'auth') AND severity IN ('WARNING', 'ERROR', 'CRITICAL')");
    const metadataDrafts = scopedWhere(scope, tenantId, "status IN ('DRAFT', 'VALIDATING')");
    const failedMetadataMigrations = scopedWhere(scope, tenantId, "status IN ('FAILED', 'ERROR')");

    const [
      totalTenants,
      suspendedTenants,
      jobsFailed,
      jobsDead,
      jobsQueued,
      jobsStale,
      notificationsFailed,
      notificationsDead,
      notificationsQueued,
      ordersUnreconciled,
      providerEventsFailed,
      connectionsFailing,
      integrationAuditFailed,
      apiKeysExpired,
      approvalsPending,
      approvalsOverdue,
      approvalsEscalated,
      incidentsOpen,
      incidentsCritical,
      incidentsAcknowledged,
      sloBreaching,
      observabilityErrors,
      observabilityWarnings,
      securityEvents,
      drafts,
      metadataMigrationFailures,
    ] = await Promise.all([
      scope === 'PLATFORM' ? count('SELECT COUNT(*)::int AS count FROM tenants') : Promise.resolve(0),
      scope === 'PLATFORM' ? count('SELECT COUNT(*)::int AS count FROM tenants WHERE is_active = false') : Promise.resolve(0),
      count(`SELECT COUNT(*)::int AS count FROM background_jobs ${failedJobs.where}`, failedJobs.values),
      count(`SELECT COUNT(*)::int AS count FROM background_jobs ${deadJobs.where}`, deadJobs.values),
      count(`SELECT COUNT(*)::int AS count FROM background_jobs ${queuedJobs.where}`, queuedJobs.values),
      count(`SELECT COUNT(*)::int AS count FROM background_jobs ${staleJobs.where}`, staleJobs.values),
      count(`SELECT COUNT(*)::int AS count FROM notification_outbox ${failedNotifications.where}`, failedNotifications.values),
      count(`SELECT COUNT(*)::int AS count FROM notification_outbox ${deadNotifications.where}`, deadNotifications.values),
      count(`SELECT COUNT(*)::int AS count FROM notification_outbox ${queuedNotifications.where}`, queuedNotifications.values),
      count(`SELECT COUNT(*)::int AS count FROM payment_orders ${unreconciledOrders.where}`, unreconciledOrders.values),
      count(`SELECT COUNT(*)::int AS count FROM payment_provider_events ${failedProviderEvents.where}`, failedProviderEvents.values),
      count(`SELECT COUNT(*)::int AS count FROM integration_connections ${failingConnections.where}`, failingConnections.values),
      count(`SELECT COUNT(*)::int AS count FROM integration_audit_logs ${failedIntegrationAudit.where}`, failedIntegrationAudit.values),
      count(`SELECT COUNT(*)::int AS count FROM integration_api_keys ${expiredKeys.where}`, expiredKeys.values),
      count(`SELECT COUNT(*)::int AS count FROM workflow_approval_requests ${pendingApprovals.where}`, pendingApprovals.values),
      count(`SELECT COUNT(*)::int AS count FROM workflow_approval_requests ${overdueApprovals.where}`, overdueApprovals.values),
      count(`SELECT COUNT(*)::int AS count FROM workflow_approval_requests ${escalatedApprovals.where}`, escalatedApprovals.values),
      count(`SELECT COUNT(*)::int AS count FROM sre_incidents ${openIncidents.where}`, openIncidents.values),
      count(`SELECT COUNT(*)::int AS count FROM sre_incidents ${criticalIncidents.where}`, criticalIncidents.values),
      count(`SELECT COUNT(*)::int AS count FROM sre_incidents ${acknowledgedIncidents.where}`, acknowledgedIncidents.values),
      count(`SELECT COUNT(*)::int AS count FROM slo_measurements ${sloBreaches.where}`, sloBreaches.values),
      count(`SELECT COUNT(*)::int AS count FROM observability_events ${errorEvents.where}`, errorEvents.values),
      count(`SELECT COUNT(*)::int AS count FROM observability_events ${warningEvents.where}`, warningEvents.values),
      count(`SELECT COUNT(*)::int AS count FROM observability_events ${suspiciousEvents.where}`, suspiciousEvents.values),
      count(`SELECT COUNT(*)::int AS count FROM metadata_objects ${metadataDrafts.where}`, metadataDrafts.values),
      count(`SELECT COUNT(*)::int AS count FROM metadata_migration_jobs ${failedMetadataMigrations.where}`, failedMetadataMigrations.values),
    ]);

    return {
      database,
      tenants: {
        total: totalTenants,
        suspended: suspendedTenants,
      },
      jobs: {
        failed: jobsFailed,
        deadLettered: jobsDead,
        queued: jobsQueued,
        staleLocked: jobsStale,
      },
      notifications: {
        failed: notificationsFailed,
        deadLettered: notificationsDead,
        queued: notificationsQueued,
      },
      payments: {
        unreconciledOrders: ordersUnreconciled,
        failedProviderEvents: providerEventsFailed,
      },
      integrations: {
        failingConnections: connectionsFailing,
        webhookFailures: integrationAuditFailed,
        expiredApiKeys: apiKeysExpired,
      },
      approvals: {
        pending: approvalsPending,
        overdue: approvalsOverdue,
        escalated: approvalsEscalated,
      },
      incidents: {
        open: incidentsOpen,
        critical: incidentsCritical,
        acknowledged: incidentsAcknowledged,
      },
      observability: {
        sloBreaches: sloBreaching,
        errorEvents: observabilityErrors,
        warningEvents: observabilityWarnings,
      },
      security: {
        suspiciousEvents: securityEvents,
        secretsDueRotation: apiKeysExpired,
      },
      dataPlatform: {
        metadataDrafts: drafts,
        failedMigrations: metadataMigrationFailures,
        migrationDrift: metadataMigrationFailures,
      },
    };
  });
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
  if (auth.ok === false) return auth.response;

  const url = new URL(request.url);
  const requestedScope = url.searchParams.get('scope')?.toUpperCase();
  const isPlatformOperator = auth.context.role === 'PLATFORM_ADMIN';
  const scope: OperatorConsoleScope = isPlatformOperator && requestedScope !== 'TENANT' ? 'PLATFORM' : 'TENANT';
  const tenantIdParam = url.searchParams.get('tenantId') || undefined;
  const tenantId = scope === 'TENANT' && isPlatformOperator
    ? tenantIdParam ?? auth.context.tenantId
    : auth.context.tenantId;

  if (scope === 'TENANT' && (!tenantId || !isValidTenantId(tenantId))) {
    return NextResponse.json({ error: 'A valid tenantId is required for tenant-scoped console snapshots.' }, { status: 400 });
  }

  const metrics = await collectOperatorConsoleMetrics(scope, tenantId);
  const snapshot = buildOperatorConsoleSnapshot({
    scope,
    tenantId: scope === 'TENANT' ? tenantId : undefined,
    metrics,
  });

  const tiles = filterOperatorTilesForContext(auth.context, snapshot.tiles, scope);
  const visibleDomains = new Set(tiles.map((tile) => tile.domain));
  const signals = snapshot.signals.filter((signal) => visibleDomains.has(signal.domain));

  return NextResponse.json({
    snapshot: {
      ...snapshot,
      tiles,
      signals,
      status: combineOperatorSeverity(tiles.map((tile) => tile.severity)),
      healthScore: calculateOperatorHealthScore(tiles, signals),
    },
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
