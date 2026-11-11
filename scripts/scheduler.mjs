#!/usr/bin/env node
//
// Local job scheduler — replaces the Vercel cron. Triggers /api/jobs/dispatch
// (background jobs + notification outbox) on an interval while the app runs.
//
//   node --env-file=apps/web/.env.local scripts/scheduler.mjs   (or: pnpm scheduler)
//
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SECRET = process.env.JOB_DISPATCH_SECRET;
const parsedInterval = Number(process.env.SCHEDULER_INTERVAL_MS || 60_000);
const INTERVAL_MS = Number.isFinite(parsedInterval) && parsedInterval >= 1_000 ? parsedInterval : 60_000;

if (!SECRET) {
  console.error('[scheduler] JOB_DISPATCH_SECRET is required (see apps/web/.env.local)');
  process.exit(1);
}

let inFlight = false;

async function tick() {
  if (inFlight) {
    console.log(`[scheduler] ${new Date().toISOString()} → skipped (previous tick still in flight)`);
    return;
  }

  inFlight = true;
  try {
    const res = await fetch(`${APP_URL}/api/jobs/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[scheduler] ${new Date().toISOString()} → ${res.status}`, JSON.stringify(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[scheduler] dispatch failed: ${message}`);
  } finally {
    inFlight = false;
  }
}

if (process.argv.includes('--once')) {
  await tick();
  process.exit(0);
}

console.log(`[scheduler] every ${INTERVAL_MS}ms → ${APP_URL}/api/jobs/dispatch`);
void tick();
setInterval(() => {
  void tick();
}, INTERVAL_MS);
