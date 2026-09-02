#!/usr/bin/env node
/**
 * Toolchain preflight guard (issue #32).
 *
 * Asserts the developer is on the pinned toolchain — the Node major from
 * `engines.node` and the exact pnpm from `packageManager` (which Corepack reads to
 * pick pnpm automatically). Drift here is the root of "works on my machine": a
 * mismatched pnpm rewrites the lockfile, a mismatched Node changes build output.
 *
 * Two modes:
 *   (default)  warn-only, ALWAYS exits 0 — safe as an npm `preinstall` hook, so it
 *              never breaks a local install or a Vercel deploy on a stray runtime.
 *   --strict   exits 1 on any mismatch — used by `pnpm check:toolchain` in CI, where
 *              the runtime is pinned and drift must fail the build.
 *
 * Node built-ins only: `preinstall` runs before dependencies exist.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const strict = process.argv.includes('--strict');
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

/** Corepack enables pnpm from this field; keep the guard reading the same source. */
const COREPACK_HINT = 'Run `corepack enable` once, then `pnpm install` — Corepack pins pnpm from package.json.';

const problems = [];

// ── Node: engines.node is "">=<major> <<major+1>"; enforce the major. ──────────
const requiredNode = String(pkg.engines?.node ?? '').trim();
const requiredNodeMajor = requiredNode.match(/>=\s*(\d+)/)?.[1];
const actualNodeMajor = String(process.versions.node).split('.')[0];
if (requiredNodeMajor && actualNodeMajor !== requiredNodeMajor) {
  problems.push(
    `Node ${process.versions.node} is in use, but this repo requires Node ${requiredNode} ` +
      `(major ${requiredNodeMajor}). Install Node ${requiredNodeMajor} (e.g. via nvm/fnm/volta).`,
  );
}

// ── pnpm: compare the active pnpm against the `packageManager` pin. ────────────
// The running package manager reports itself in npm_config_user_agent, e.g.
// "pnpm/9.15.9 npm/? node/v24.4.0 ...". Absent (script run via bare `node`), the
// pnpm check is skipped — there is nothing authoritative to compare against.
const pinned = String(pkg.packageManager ?? '');
const pinnedPnpm = pinned.startsWith('pnpm@') ? pinned.slice('pnpm@'.length) : null;
const uaPnpm = /pnpm\/(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent ?? '')?.[1] ?? null;
if (pinnedPnpm && uaPnpm && uaPnpm !== pinnedPnpm) {
  problems.push(
    `pnpm ${uaPnpm} is in use, but this repo pins pnpm ${pinnedPnpm}. ${COREPACK_HINT}`,
  );
}
if (pinnedPnpm && !uaPnpm && strict) {
  // In CI we insist on running under pnpm so the pin is actually verified.
  problems.push(
    `Could not detect the active pnpm (expected ${pinnedPnpm}). Run this via \`pnpm check:toolchain\`, not bare node.`,
  );
}

if (problems.length === 0) {
  if (strict) console.log(`✓ toolchain: Node ${actualNodeMajor}.x, pnpm ${uaPnpm ?? pinnedPnpm} (matches pins)`);
  process.exit(0);
}

const label = strict ? 'Toolchain check failed' : 'Toolchain warning';
console[strict ? 'error' : 'warn'](`\n${strict ? '✗' : '⚠'} ${label} (issue #32):`);
for (const problem of problems) console[strict ? 'error' : 'warn'](`  • ${problem}`);
console[strict ? 'error' : 'warn'](`  ${COREPACK_HINT}\n`);

process.exit(strict ? 1 : 0);
