import { NextResponse } from 'next/server';
import { register, collectDefaultMetrics } from 'prom-client';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { initializeAppMetrics } from '@/lib/observability/metrics';

// Only collect default metrics once to prevent memory leaks in dev/hot-reloads
if (!global.__PROMETHEUS_COLLECTOR_INIT) {
  collectDefaultMetrics({ prefix: 'school_sis_' });
  global.__PROMETHEUS_COLLECTOR_INIT = true;
}
initializeAppMetrics();

export async function GET(request: Request) {
  try {
    const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
      serviceName: 'Metrics endpoint',
      required: process.env.NODE_ENV === 'production',
    });
    if (authError) return authError;

    const metrics = await register.metrics();
    
    return new NextResponse(metrics, {
      headers: {
        'Content-Type': register.contentType,
      },
    });
  } catch (ex) {
    return new NextResponse('Error generating metrics', { status: 500 });
  }
}
