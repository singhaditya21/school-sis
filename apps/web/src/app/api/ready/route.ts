import { NextResponse } from 'next/server';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { getDatabaseHealth } from '@/lib/observability/snapshot';
import { getRateLimitHealth } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
    serviceName: 'Readiness endpoint',
    required: process.env.NODE_ENV === 'production',
  });
  if (authError) return authError;

  const [database, rateLimit] = await Promise.all([
    getDatabaseHealth(),
    getRateLimitHealth(),
  ]);
  const ready = database.status === 'healthy';
  const status = ready
    ? rateLimit.status === 'degraded' ? 'degraded' : 'ready'
    : 'not_ready';

  return NextResponse.json(
    {
      status,
      generatedAt: new Date().toISOString(),
      database,
      rateLimit,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
