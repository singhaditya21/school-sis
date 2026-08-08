import { Gauge, register } from 'prom-client';
import type { QueryResult } from 'pg';
import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';
import { getDatabaseHealth } from '@/lib/observability/snapshot';
import { logger } from '@/lib/observability/logger';
import { initializeRateLimitMetrics } from '@/lib/auth/rate-limit';

declare global {
  var __SCHOOL_SIS_APP_METRICS_INIT: boolean | undefined;
}

const JOB_STATUSES = ['QUEUED', 'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'];
const NOTIFICATION_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER',
  'SUPPRESSED',
];
const INCIDENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'];
const INCIDENT_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];

type CollectableGauge = Gauge<string> & { collect?: () => void | Promise<void> };

function getGauge(name: string, help: string, labelNames: string[] = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as CollectableGauge;
  return new Gauge({ name, help, labelNames }) as CollectableGauge;
}

async function queryCounts(sql: string): Promise<Record<string, number>> {
  const result = await runWithRlsBypass<QueryResult<{ key: string; count: string }>>(
    RLS_BYPASS_JUSTIFICATIONS.PLATFORM_METRICS,
    () => pool.query(sql),
  );
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
  initializeRateLimitMetrics();
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
    'Notification outbox entries by status, channel, and provider over the last seven days',
    ['status', 'channel', 'provider'],
  );
  notificationGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_notification_outbox', async () => {
      this.reset();
      const result = await runWithRlsBypass<QueryResult<{ status: string; channel: string; provider: string; count: string }>>(
        RLS_BYPASS_JUSTIFICATIONS.PLATFORM_METRICS,
        () => pool.query(
        `SELECT status, channel, provider, COUNT(*)::int AS count
         FROM notification_outbox
         WHERE created_at >= NOW() - INTERVAL '7 days'
           AND status IN ('PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED')
           AND channel IN ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP')
           AND provider IN ('smtp', 'resend', 'msg91', 'twilio', 'firebase', 'database', 'mock', 'unconfigured')
         GROUP BY status, channel, provider`,
        ),
      );
      for (const row of result.rows) {
        if (NOTIFICATION_STATUSES.includes(row.status)) {
          this.set({ status: row.status, channel: row.channel, provider: row.provider }, Number(row.count));
        }
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
