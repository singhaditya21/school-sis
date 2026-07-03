import { NextResponse } from 'next/server';
import { dispatchDueJobs } from '@/lib/worker/dispatcher';
import { processDueNotifications } from '@/lib/notifications/outbox';
import { requireBearerServiceAuth } from '@/lib/auth/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function numberFromBody(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

async function runDispatcher(body: Record<string, unknown>) {
  const queue = typeof body.queue === 'string' && body.queue.trim() ? body.queue.trim() : 'default';
  const limit = numberFromBody(body.limit, 10, 100);
  const notificationLimit = numberFromBody(body.notificationLimit, 25, 100);
  const sweepNotifications = body.sweepNotifications !== false;

  const jobs = await dispatchDueJobs({ queue, limit });
  const notifications = sweepNotifications
    ? await processDueNotifications(notificationLimit)
    : { processed: 0, succeeded: 0, failed: 0 };

  return NextResponse.json({
    jobs,
    notifications,
  });
}

export async function POST(request: Request) {
  const authError = requireBearerServiceAuth(request, 'JOB_DISPATCH_SECRET', {
    serviceName: 'Job dispatcher',
  });
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return runDispatcher(body);
}

export async function GET(request: Request) {
  const authError = requireBearerServiceAuth(request, 'CRON_SECRET', {
    minLength: 32,
    serviceName: 'Vercel Cron job dispatcher',
  });
  if (authError) return authError;

  return runDispatcher({});
}
