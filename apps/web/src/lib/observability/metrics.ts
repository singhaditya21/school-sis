import { Gauge, register } from 'prom-client';
import type { QueryResult } from 'pg';
import { pool, runWithRlsBypass } from '@/lib/db';
import { getDatabaseHealth } from '@/lib/observability/snapshot';
import { logger } from '@/lib/observability/logger';

declare global {
  // eslint-disable-next-line no-var
  var __SCHOOL_SIS_APP_METRICS_INIT: boolean | undefined;
}

const JOB_STATUSES = ['QUEUED', 'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'];
const NOTIFICATION_STATUSES = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'];
const INCIDENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'];
const INCIDENT_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];

type CollectableGauge = Gauge<string> & { collect?: () => void | Promise<void> };

function getGauge(name: string, help: string, labelNames: string[] = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as CollectableGauge;
  return new Gauge({ name, help, labelNames }) as CollectableGauge;
}

async function queryCounts(sql: string): Promise<Record<string, number>> {
  const result = await runWithRlsBypass<QueryResult<{ key: string; count: string }>>(() => pool.query(sql));
  return Object.fromEntries(result.rows.map((row) => [row.key, Number(row.count)]));
}

async function safeCollect(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    logger.warn('metrics.collect_failed', 'Failed to collect Prometheus metric', {
      source: 'metrics',
      metadata: { metric: name, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

export function initializeAppMetrics() {
  if (globalThis.__SCHOOL_SIS_APP_METRICS_INIT) return;

  const dbReady = getGauge('school_sis_database_ready', 'Database readiness probe status, 1 for ready and 0 for failed');
  dbReady.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_database_ready', async () => {
      const health = await getDatabaseHealth();
      this.set(health.status === 'healthy' ? 1 : 0);
    });
  };

  const jobGauge = getGauge('school_sis_background_jobs', 'Background jobs by status over the last seven days', ['status']);
  jobGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_background_jobs', async () => {
      this.reset();
      const counts = await queryCounts(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM background_jobs
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      );
      for (const status of JOB_STATUSES) {
        this.set({ status }, counts[status] || 0);
      }
    });
  };

  const notificationGauge = getGauge(
    'school_sis_notification_outbox',
    'Notification outbox entries by status over the last seven days',
    ['status'],
  );
  notificationGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_notification_outbox', async () => {
      this.reset();
      const counts = await queryCounts(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM notification_outbox
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      );
      for (const status of NOTIFICATION_STATUSES) {
        this.set({ status }, counts[status] || 0);
      }
    });
  };

  const incidentStatusGauge = getGauge('school_sis_sre_incidents', 'SRE incidents by status', ['status']);
  incidentStatusGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_sre_incidents', async () => {
      this.reset();
      const counts = await queryCounts(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM sre_incidents
         GROUP BY status`,
      );
      for (const status of INCIDENT_STATUSES) {
        this.set({ status }, counts[status] || 0);
      }
    });
  };

  const incidentSeverityGauge = getGauge(
    'school_sis_sre_open_incidents_by_severity',
    'Open or acknowledged SRE incidents by severity',
    ['severity'],
  );
  incidentSeverityGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_sre_open_incidents_by_severity', async () => {
      this.reset();
      const counts = await queryCounts(
        `SELECT severity AS key, COUNT(*)::int AS count
         FROM sre_incidents
         WHERE status IN ('OPEN', 'ACKNOWLEDGED')
         GROUP BY severity`,
      );
      for (const severity of INCIDENT_SEVERITIES) {
        this.set({ severity }, counts[severity] || 0);
      }
    });
  };

  globalThis.__SCHOOL_SIS_APP_METRICS_INIT = true;
}
