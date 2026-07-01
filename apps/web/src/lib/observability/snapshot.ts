import { pool, runWithRlsBypass } from '@/lib/db';

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export type OperationalSnapshot = {
  status: ComponentStatus;
  generatedAt: string;
  database: {
    status: ComponentStatus;
    latencyMs: number | null;
  };
  jobs: {
    byStatus: Record<string, number>;
    deadLettered: number;
    failed: number;
    queued: number;
  };
  notifications: {
    byStatus: Record<string, number>;
    deadLettered: number;
    failed: number;
    queued: number;
  };
  incidents: {
    open: number;
    critical: number;
    bySeverity: Record<string, number>;
  };
  slo: {
    active: number;
    latestBreaches: number;
  };
};

function rowsToCountMap(rows: Array<{ key: string; count: number | string }>): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
}

function statusFrom(snapshot: Omit<OperationalSnapshot, 'status'>): ComponentStatus {
  if (snapshot.database.status === 'unhealthy' || snapshot.incidents.critical > 0) return 'unhealthy';
  if (
    snapshot.jobs.deadLettered > 0 ||
    snapshot.notifications.deadLettered > 0 ||
    snapshot.incidents.open > 0 ||
    snapshot.slo.latestBreaches > 0
  ) {
    return 'degraded';
  }
  return 'healthy';
}

export async function getDatabaseHealth(): Promise<{ status: ComponentStatus; latencyMs: number | null }> {
  const startedAt = Date.now();
  try {
    await runWithRlsBypass(() => pool.query('SELECT 1'));
    return { status: 'healthy', latencyMs: Date.now() - startedAt };
  } catch {
    return { status: 'unhealthy', latencyMs: null };
  }
}

export async function collectOperationalSnapshot(): Promise<OperationalSnapshot> {
  const database = await getDatabaseHealth();

  const query = async () => {
    const [
      jobsResult,
      notificationsResult,
      incidentsResult,
      sloDefinitionsResult,
      sloMeasurementsResult,
    ] = await Promise.all([
      pool.query<{ key: string; count: string }>(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM background_jobs
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      ),
      pool.query<{ key: string; count: string }>(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM notification_outbox
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      ),
      pool.query<{ key: string; count: string }>(
        `SELECT severity AS key, COUNT(*)::int AS count
         FROM sre_incidents
         WHERE status IN ('OPEN', 'ACKNOWLEDGED')
         GROUP BY severity`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM slo_definitions
         WHERE is_active = true`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM slo_measurements
         WHERE window_end >= NOW() - INTERVAL '24 hours'
           AND status IN ('BREACHING', 'BREACHED')`,
      ),
    ]);

    const jobsByStatus = rowsToCountMap(jobsResult.rows);
    const notificationsByStatus = rowsToCountMap(notificationsResult.rows);
    const incidentsBySeverity = rowsToCountMap(incidentsResult.rows);

    return {
      jobsByStatus,
      notificationsByStatus,
      incidentsBySeverity,
      activeSloCount: Number(sloDefinitionsResult.rows[0]?.count || 0),
      latestSloBreaches: Number(sloMeasurementsResult.rows[0]?.count || 0),
    };
  };

  const counts = await runWithRlsBypass(query);
  const base = {
    generatedAt: new Date().toISOString(),
    database,
    jobs: {
      byStatus: counts.jobsByStatus,
      deadLettered: counts.jobsByStatus.DEAD_LETTER || 0,
      failed: counts.jobsByStatus.FAILED || 0,
      queued: (counts.jobsByStatus.QUEUED || 0) + (counts.jobsByStatus.SCHEDULED || 0),
    },
    notifications: {
      byStatus: counts.notificationsByStatus,
      deadLettered: counts.notificationsByStatus.DEAD_LETTER || 0,
      failed: counts.notificationsByStatus.FAILED || 0,
      queued: (counts.notificationsByStatus.PENDING || 0) + (counts.notificationsByStatus.QUEUED || 0),
    },
    incidents: {
      open: Object.values(counts.incidentsBySeverity).reduce((sum, count) => sum + count, 0),
      critical: counts.incidentsBySeverity.CRITICAL || 0,
      bySeverity: counts.incidentsBySeverity,
    },
    slo: {
      active: counts.activeSloCount,
      latestBreaches: counts.latestSloBreaches,
    },
  };

  return {
    status: statusFrom(base),
    ...base,
  };
}
