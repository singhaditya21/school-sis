import { NextResponse } from 'next/server';
import client from 'prom-client';

// Initialize the default registry
const register = new client.Registry();

// Add default system metrics (memory, cpu, etc.)
client.collectDefaultMetrics({ register, prefix: 'school_sis_' });

// Example of a custom metric
export const httpRequestCounter = new client.Counter({
  name: 'school_sis_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export async function GET() {
  try {
    const metrics = await register.metrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': register.contentType,
      },
    });
  } catch (ex) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
