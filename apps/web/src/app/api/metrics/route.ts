import { NextResponse } from 'next/server';
import { register, collectDefaultMetrics } from 'prom-client';

// Only collect default metrics once to prevent memory leaks in dev/hot-reloads
if (!global.__PROMETHEUS_COLLECTOR_INIT) {
  collectDefaultMetrics({ prefix: 'school_sis_' });
  global.__PROMETHEUS_COLLECTOR_INIT = true;
}

export async function GET() {
  try {
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
