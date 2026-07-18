#!/usr/bin/env node
//
// Local job scheduler — replaces the Vercel cron. Triggers /api/jobs/dispatch
// (background jobs + notification outbox) on an interval while the app runs.
//
//   node --env-file=apps/web/.env.local scripts/scheduler.mjs   (or: pnpm scheduler)
//
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SECRET = process.env.JOB_DISPATCH_SECRET;
const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS || 60_000);

if (!SECRET) {
  console.error('[scheduler] JOB_DISPATCH_SECRET is required (see apps/web/.env.local)');
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${APP_URL}/api/jobs/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[scheduler] ${new Date().toISOString()} → ${res.status}`, JSON.stringify(data));
  } catch (err) {
    console.log(`[scheduler] dispatch failed: ${err.message}`);
  }
}

if (process.argv.includes('--once')) {
  await tick();
  process.exit(0);
}

console.log(`[scheduler] every ${INTERVAL_MS}ms → ${APP_URL}/api/jobs/dispatch`);
tick();
setInterval(tick, INTERVAL_MS);
