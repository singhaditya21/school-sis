import { Counter, Gauge, register } from 'prom-client';
import { RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass, sql } from '@/lib/db';
import { getDatabaseHealth } from '@/lib/observability/snapshot';
import { logger } from '@/lib/observability/logger';
import { initializeRateLimitMetrics } from '@/lib/auth/rate-limit';

declare global {
  var __SCHOOL_SIS_APP_METRICS_INIT: boolean | undefined;
}

const JOB_STATUSES = ['QUEUED', 'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'];
const NOTIFICATION_STATUSES = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'];
const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'];
const INCIDENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'];
const INCIDENT_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
const LEAD_CRM_STATUSES = ['QUEUED', 'INTERNAL_QUEUE', 'ROUTED', 'FAILED', 'LEGACY'];
export const LEAD_CAPTURE_OUTCOMES = [
  'accepted',
  'bot_screened',
  'invalid',
  'rate_limited',
  'captcha_failed',
  'unauthorized',
  'failed',
] as const;
export type LeadCaptureOutcome = (typeof LEAD_CAPTURE_OUTCOMES)[number];

type CollectableGauge = Gauge<string> & { collect?: () => void | Promise<void> };

function getGauge(name: string, help: string, labelNames: string[] = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as CollectableGauge;
  return new Gauge({ name, help, labelNames }) as CollectableGauge;
}

function getCounter(name: string, help: string, labelNames: string[] = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Counter<string>;
  return new Counter({ name, help, labelNames });
}

export function recordLeadCaptureOutcome(outcome: LeadCaptureOutcome): void {
  const counter = getCounter(
    'school_sis_lead_capture_requests_total',
    'Inbound marketing lead capture requests partitioned by validation, anti-abuse, and persistence outcome',
    ['outcome'],
  );
  counter.inc({ outcome });
}

async function queryCounts(
  table: 'background_jobs' | 'notification_outbox' | 'marketing_leads' | 'sre_incidents',
  mode: 'status_7d' | 'crm_7d' | 'incident_status' | 'incident_severity',
): Promise<Record<string, number>> {
  const rows = await runWithRlsBypass<Array<{ key: string; count: number }>>(
    RLS_BYPASS_JUSTIFICATIONS.PLATFORM_METRICS,
    async () => {
      if (table === 'background_jobs' && mode === 'status_7d') {
        return await sql<{ key: string; count: number }>`
          SELECT status AS key, COUNT(*)::int AS count
          FROM background_jobs
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY status
        `;
      }
      if (table === 'notification_outbox' && mode === 'status_7d') {
        return await sql<{ key: string; count: number }>`
          SELECT status AS key, COUNT(*)::int AS count
          FROM notification_outbox
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY status
        `;
      }
      if (table === 'marketing_leads' && mode === 'crm_7d') {
        return await sql<{ key: string; count: number }>`
          SELECT crm_status AS key, COUNT(*)::int AS count
          FROM marketing_leads
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY crm_status
        `;
      }
      if (table === 'sre_incidents' && mode === 'incident_status') {
        return await sql<{ key: string; count: number }>`
          SELECT status AS key, COUNT(*)::int AS count
          FROM sre_incidents
          GROUP BY status
        `;
      }
      return await sql<{ key: string; count: number }>`
        SELECT severity AS key, COUNT(*)::int AS count
        FROM sre_incidents
        WHERE status IN ('OPEN', 'ACKNOWLEDGED')
        GROUP BY severity
      `;
    },
  );
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
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

  const leadCaptureCounter = getCounter(
    'school_sis_lead_capture_requests_total',
    'Inbound marketing lead capture requests partitioned by validation, anti-abuse, and persistence outcome',
    ['outcome'],
  );
  for (const outcome of LEAD_CAPTURE_OUTCOMES) {
    leadCaptureCounter.inc({ outcome }, 0);
  }

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
      const counts = await queryCounts('background_jobs', 'status_7d');
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
      const counts = await queryCounts('notification_outbox', 'status_7d');
      for (const status of NOTIFICATION_STATUSES) {
        this.set({ status }, counts[status] || 0);
      }
    });
  };

  const notificationByChannelGauge = getGauge(
    'school_sis_notification_outbox_by_channel',
    'Notification outbox entries by channel and status over the last seven days',
    ['channel', 'status'],
  );
  notificationByChannelGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_notification_outbox_by_channel', async () => {
      this.reset();
      const rows = await runWithRlsBypass<Array<{ channel: string; status: string; count: number }>>(
        RLS_BYPASS_JUSTIFICATIONS.PLATFORM_METRICS,
        async () =>
          await sql<{ channel: string; status: string; count: number }>`
            SELECT channel, status, COUNT(*)::int AS count
            FROM notification_outbox
            WHERE created_at >= NOW() - INTERVAL '7 days'
            GROUP BY channel, status
          `,
      );
      const indexed = new Map<string, number>();
      for (const row of rows) {
        indexed.set(`${row.channel}:${row.status}`, Number(row.count));
      }
      for (const channel of NOTIFICATION_CHANNELS) {
        for (const status of NOTIFICATION_STATUSES) {
          this.set({ channel, status }, indexed.get(`${channel}:${status}`) || 0);
        }
      }
    });
  };

  const leadCrmGauge = getGauge(
    'school_sis_marketing_leads_crm',
    'Marketing leads by CRM routing status over the last seven days',
    ['status'],
  );
  leadCrmGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_marketing_leads_crm', async () => {
      this.reset();
      const counts = await queryCounts('marketing_leads', 'crm_7d');
      for (const status of LEAD_CRM_STATUSES) {
        this.set({ status }, counts[status] || 0);
      }
    });
  };

  const incidentStatusGauge = getGauge('school_sis_sre_incidents', 'SRE incidents by status', ['status']);
  incidentStatusGauge.collect = async function collect(this: Gauge<string>) {
    await safeCollect('school_sis_sre_incidents', async () => {
      this.reset();
      const counts = await queryCounts('sre_incidents', 'incident_status');
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
      const counts = await queryCounts('sre_incidents', 'incident_severity');
      for (const severity of INCIDENT_SEVERITIES) {
        this.set({ severity }, counts[severity] || 0);
      }
    });
  };

  globalThis.__SCHOOL_SIS_APP_METRICS_INIT = true;
}
