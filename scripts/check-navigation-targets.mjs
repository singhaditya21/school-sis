#!/usr/bin/env node

/**
 * Every navigation link must point at a route that exists.
 *
 * The admin sidebar once advertised five routes with no page.tsx at all
 * (/university/advising, /university/research, /university/placement,
 * /coaching/batches, /coaching/doubts) — a click from the sidebar was a 404.
 * This gate makes that unshippable.
 *
 *   node scripts/check-navigation-targets.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(REPO_ROOT, 'apps/web/src/app');

/** Files that define navigation. Add new nav surfaces here. */
const NAV_SOURCES = [
  'apps/web/src/app/(admin)/layout.tsx',
  'apps/web/src/app/teacher/layout.tsx',
  'apps/web/src/app/student/layout.tsx',
  'apps/web/src/app/(parent)/layout.tsx',
  'apps/web/src/app/(dashboard)/layout.tsx',
  'apps/web/src/components/dashboard/ModuleGrid.tsx',
];

/** Collect every routable pathname by walking the app directory for page.tsx. */
function collectRoutes(dir, prefix = '') {
  const routes = new Set();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx') routes.add(prefix || '/');
      continue;
    }
    // (group) segments do not appear in the URL; [dynamic] matches anything.
    const segment = /^\(.*\)$/.test(entry) ? '' : `/${entry}`;
    for (const r of collectRoutes(full, prefix + segment)) routes.add(r);
  }
  return routes;
}

const routes = collectRoutes(APP_DIR);

/** A concrete path matches a route pattern if every segment lines up, allowing [dynamic]. */
function routeExists(pathname) {
  const want = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    const have = route.split('/').filter(Boolean);
    if (have.length !== want.length) continue;
    if (have.every((seg, i) => seg === want[i] || /^\[.*\]$/.test(seg))) return true;
  }
  return false;
}

const findings = [];
for (const source of NAV_SOURCES) {
  const path = join(REPO_ROOT, source);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, 'utf8');
  const seen = new Set();

  for (const match of content.matchAll(/href[=:]\s*["'](\/[^"'`$]*)["']/g)) {
    const pathname = match[1].split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
    if (seen.has(pathname)) continue;
    seen.add(pathname);
    if (!routeExists(pathname)) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({ source, line, pathname });
    }
  }
}

if (findings.length > 0) {
  console.error('Navigation links point at routes that do not exist:\n');
  for (const f of findings) console.error(`  ${f.source}:${f.line}  →  ${f.pathname}`);
  console.error('\nEither build the route, or remove the link. A nav entry that 404s is worse');
  console.error('than a missing feature — it tells the user the feature is there.');
  process.exit(1);
}

console.log(`Navigation target check passed (${routes.size} routes known).`);
