#!/usr/bin/env node

/**
 * A production driver for /api/jobs/dispatch must exist.
 *
 * The `crons` block was silently lost when vercel.json was deleted during the
 * July local-first pivot, and was not restored when Vercel came back in August.
 * For weeks nothing drained the queue: fee reminders, receipts and admission
 * notifications never sent, while the deploy pipeline and the readiness endpoint
 * both reported green. This gate makes that state unshippable.
 *
 *   node scripts/check-job-scheduler-wiring.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DISPATCH_PATH = '/api/jobs/dispatch';

const drivers = [];
const problems = [];

// 1. Vercel Cron (drives the GET path with CRON_SECRET).
const vercelJsonPath = join(REPO_ROOT, 'apps/web/vercel.json');
if (existsSync(vercelJsonPath)) {
  let config;
  try {
    config = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));
  } catch {
    problems.push('apps/web/vercel.json is not valid JSON.');
  }
  const crons = Array.isArray(config?.crons) ? config.crons : [];
  const cron = crons.find((entry) => entry?.path === DISPATCH_PATH);
  if (cron) {
    if (typeof cron.schedule !== 'string' || cron.schedule.trim().split(/\s+/).length !== 5) {
      problems.push(`vercel.json cron for ${DISPATCH_PATH} has an invalid schedule: ${cron.schedule}`);
    } else {
      drivers.push(`vercel.json cron (${cron.schedule})`);
    }
  }
}

// 2. A scheduled GitHub Actions workflow that POSTs to the dispatch endpoint.
const workflowsDir = join(REPO_ROOT, '.github/workflows');
if (existsSync(workflowsDir)) {
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const body = readFileSync(join(workflowsDir, file), 'utf8');
    if (!body.includes(DISPATCH_PATH)) continue;
    if (!/^\s*schedule:/m.test(body)) continue;
    const cron = body.match(/cron:\s*["']([^"']+)["']/)?.[1];
    drivers.push(`.github/workflows/${file}${cron ? ` (${cron})` : ''}`);
  }
}

if (problems.length > 0) {
  console.error('Job scheduler wiring is malformed:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

if (drivers.length === 0) {
  console.error(`Nothing drives ${DISPATCH_PATH} in production.\n`);
  console.error('Queued fee reminders, receipts and admission notifications will never send,');
  console.error('and neither the deploy pipeline nor the readiness endpoint will notice.\n');
  console.error('Add either a `crons` entry in apps/web/vercel.json or a scheduled workflow');
  console.error('under .github/workflows/ that POSTs to the endpoint with JOB_DISPATCH_SECRET.');
  process.exit(1);
}

console.log(`Job dispatch driver check passed (${drivers.length}):`);
for (const driver of drivers) console.log(`  ${driver}`);
