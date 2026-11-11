import { NextResponse } from 'next/server';
import { register, collectDefaultMetrics } from 'prom-client';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass, sql } from '@/lib/db';
import { initializeAppMetrics } from '@/lib/observability/metrics';

// Only collect default metrics once to prevent memory leaks in dev/hot-reloads
if (!global.__PROMETHEUS_COLLECTOR_INIT) {
  collectDefaultMetrics({ prefix: 'school_sis_' });
  global.__PROMETHEUS_COLLECTOR_INIT = true;
}
initializeAppMetrics();

async function collectDurableRateLimitMetrics(): Promise<string> {
  try {
    const rows = await runWithRlsBypass(
      RLS_BYPASS_JUSTIFICATIONS.PLATFORM_METRICS,
      async () =>
        sql<{ active_buckets: number; locked_buckets: number; request_hits: number }>`
          SELECT COUNT(*)::int AS active_buckets,
                 COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > NOW())::int AS locked_buckets,
                 COALESCE(SUM(count), 0)::int AS request_hits
          FROM rate_limit_buckets
          WHERE expires_at > NOW()
        `,
    );
    const active = Number(rows[0]?.active_buckets ?? 0);
    const locked = Number(rows[0]?.locked_buckets ?? 0);
    const hits = Number(rows[0]?.request_hits ?? 0);
    return [
      '# HELP school_sis_rate_limit_durable_buckets Active and locked durable rate-limit buckets in PostgreSQL',
      '# TYPE school_sis_rate_limit_durable_buckets gauge',
      `school_sis_rate_limit_durable_buckets{state="active"} ${active}`,
      `school_sis_rate_limit_durable_buckets{state="locked"} ${locked}`,
      '# HELP school_sis_rate_limit_durable_window_hits Sum of hits across active durable rate-limit buckets',
      '# TYPE school_sis_rate_limit_durable_window_hits gauge',
      `school_sis_rate_limit_durable_window_hits ${hits}`,
      '',
    ].join('\n');
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  try {
    const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
      serviceName: 'Metrics endpoint',
      required: process.env.NODE_ENV === 'production',
    });
    if (authError) return authError;

    const [metrics, durableRateLimits] = await Promise.all([
      register.metrics(),
      collectDurableRateLimitMetrics(),
    ]);
    const body = durableRateLimits
      ? `${metrics.trimEnd()}\n${durableRateLimits}`
      : metrics;

    return new NextResponse(body, {
      headers: {
        'Content-Type': register.contentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return new NextResponse('Error generating metrics', {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
