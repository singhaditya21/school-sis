#!/usr/bin/env node
/*
 * Vercel build wrapper — applies Neon migrations on PRODUCTION deploys only, then builds.
 *
 * WHY: Vercel deploys previously ran only `next build`, so Drizzle migrations were
 * never applied on deploy and Neon's schema could drift from the deployed code.
 * This wrapper runs `db:migrate:prod` (which validates DIRECT_URL via
 * scripts/guard-production-migration.ts) before the build — but ONLY for production.
 *
 * ROLLOUT SAFETY:
 *   - Preview / development deploys never touch the database.
 *   - If DIRECT_URL is not configured yet, migration is SKIPPED with a loud warning
 *     (fail-open) so your deploys keep working until you add the secret.
 *   - If DIRECT_URL is set but a migration fails, the build FAILS (fail-closed) so
 *     broken schema never ships.
 *
 * REQUIRED to enable auto-migration — add to the Vercel *Production* environment:
 *   DIRECT_URL = postgresql://USER:PASSWORD@<neon-direct-host>/DB?sslmode=require
 *   where <neon-direct-host> is your Neon host WITHOUT the "-pooler" segment
 *   (DATABASE_URL keeps using the pooled "-pooler" host for runtime).
 *
 * SELF-TEST (no build, no DB writes):
 *   VERCEL_BUILD_SELFTEST=1 VERCEL_ENV=production node scripts/vercel-build.mjs
 */

import { execSync } from 'node:child_process';

/** Pure decision function — kept exported and side-effect-free so it is easy to reason about/test. */
export function planMigration(vercelEnv, hasDirectUrl) {
    if (vercelEnv !== 'production') {
        return { migrate: false, reason: `VERCEL_ENV=${vercelEnv || 'unset'} — only production deploys migrate` };
    }
    if (!hasDirectUrl) {
        return {
            migrate: false,
            warn: true,
            reason: 'production deploy but DIRECT_URL is not set — skipping migration (Neon schema may drift)',
        };
    }
    return { migrate: true, reason: 'production deploy with DIRECT_URL — applying pending Neon migrations' };
}

function run(cmd, extraEnv = {}) {
    execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
}

function main() {
    const selftest = process.env.VERCEL_BUILD_SELFTEST === '1';
    const vercelEnv = process.env.VERCEL_ENV;
    const plan = planMigration(vercelEnv, Boolean(process.env.DIRECT_URL));

    console.log(`▶ vercel-build (VERCEL_ENV=${vercelEnv || 'unset'})`);

    if (plan.warn) {
        console.warn('');
        console.warn('⚠️  ==============================================================');
        console.warn(`⚠️   ${plan.reason}`);
        console.warn('⚠️   Add DIRECT_URL (Neon *direct* / non-pooler host, sslmode=require)');
        console.warn('⚠️   to the Vercel Production environment to enable auto-migration.');
        console.warn('⚠️  ==============================================================');
        console.warn('');
    } else {
        console.log(`▶ migration: ${plan.migrate ? 'RUN' : 'skip'} — ${plan.reason}`);
    }

    if (plan.migrate) {
        if (selftest) {
            console.log('[selftest] would run: pnpm run db:migrate:prod');
        } else {
            // The production build is the controlled, explicit trigger, so we set the
            // guard's confirmation flag here. guard-production-migration.ts still
            // validates that DIRECT_URL is a direct (non-pooler) SSL host and will
            // fail the build if it is misconfigured.
            run('pnpm run db:migrate:prod', { CONFIRM_PRODUCTION_MIGRATION: 'school-sis' });
            console.log('✔ Neon migrations applied.');
        }
    }

    if (selftest) {
        console.log('[selftest] would run: pnpm run build');
        return;
    }

    console.log('▶ Building Next.js app…');
    run('pnpm run build');
}

main();
