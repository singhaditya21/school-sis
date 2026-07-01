import { NextResponse } from 'next/server';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { getDatabaseHealth } from '@/lib/observability/snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
    serviceName: 'Readiness endpoint',
    required: process.env.NODE_ENV === 'production',
  });
  if (authError) return authError;

  const database = await getDatabaseHealth();
  const ready = database.status === 'healthy';

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      generatedAt: new Date().toISOString(),
      database,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
