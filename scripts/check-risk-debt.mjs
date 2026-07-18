#!/usr/bin/env node

/**
 * Static risk-debt ratchet (issue #30).
 *
 * Counts known code-smell markers across the application source and enforces a
 * DOWNWARD-ONLY threshold: the build fails if any tracked metric rises above the
 * committed baseline. It never fails for going lower — instead it tells you to
 * re-baseline so the ratchet tightens permanently.
 *
 *   node scripts/check-risk-debt.mjs            # verify against the baseline
 *   node scripts/check-risk-debt.mjs --update   # rewrite the baseline to current
 *   node scripts/check-risk-debt.mjs --report    # print counts, never fail
 *
 * Scope is the hand-written application source only (apps/web/src +
 * packages/api/src). Generated, vendored, and build output is excluded.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'risk-debt-baseline.json');
const MAX_FILE_BYTES = 1024 * 1024;

// Only hand-written application source is ratcheted.
const INCLUDED_ROOTS = ['apps/web/src/', 'packages/api/src/'];
const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_PATH_FRAGMENTS = [
  '/node_modules/',
  '/.next/',
  '/coverage/',
  '/graphify-out/',
  '/playwright-report/',
  '/test-results/',
];
const EXCLUDED_SUFFIXES = ['.d.ts'];

/**
 * Each metric counts regex OCCURRENCES (not lines) so the ratchet reflects real
 * edits. `any` is split into a couple of anchored forms to avoid matching the
 * word "any" inside identifiers, comments, or strings.
 */
const METRICS = [
  {
    key: 'explicitAny',
    label: 'Explicit `any` types',
    patterns: [
      // `: any`, `as any`, `<any`, `, any`, `=> any`, `| any`, `& any`
      /(?::|\bas\b|<|,|=>|\||&)\s*any(?![\w$])/g,
      // `any[]`
      /(?<![\w$])any\s*\[\]/g,
    ],
  },
  {
    key: 'consoleLog',
    label: 'console.log/console.debug calls',
    patterns: [/\bconsole\s*\.\s*(?:log|debug)\s*\(/g],
  },
  {
    key: 'browserAlert',
    label: 'Browser alert()/confirm()/prompt() calls',
    // word-boundary so `.alert(` methods and identifiers like `setAlert(` don't match
    patterns: [/(?<![\w$.])(?:alert|confirm|prompt)\s*\(/g],
  },
];

function listSourceFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean).filter((file) => {
    const normalized = `/${file.replaceAll('\\', '/')}`;
    if (!INCLUDED_ROOTS.some((root) => file.startsWith(root))) return false;
    if (EXCLUDED_PATH_FRAGMENTS.some((f) => normalized.includes(f))) return false;
    if (EXCLUDED_SUFFIXES.some((s) => file.endsWith(s))) return false;
    const dot = file.lastIndexOf('.');
    const ext = dot >= 0 ? file.slice(dot).toLowerCase() : '';
    if (!INCLUDED_EXTENSIONS.has(ext)) return false;
    if (!existsSync(join(REPO_ROOT, file))) return false;
    const stats = statSync(join(REPO_ROOT, file));
    return stats.isFile() && stats.size <= MAX_FILE_BYTES;
  });
}

function countOccurrences(content, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    total += (content.match(pattern) ?? []).length;
  }
  return total;
}

function computeCounts() {
  const counts = Object.fromEntries(METRICS.map((m) => [m.key, 0]));
  for (const file of listSourceFiles()) {
    const content = readFileSync(join(REPO_ROOT, file), 'utf8');
    for (const metric of METRICS) {
      counts[metric.key] += countOccurrences(content, metric.patterns);
    }
  }
  return counts;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(counts) {
  const payload = {
    _comment:
      'Downward-only risk-debt ratchet (issue #30). CI fails if any count exceeds these. ' +
      'Lower a number after reducing that debt, then run: node scripts/check-risk-debt.mjs --update',
    counts,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

const mode = process.argv.includes('--update')
  ? 'update'
  : process.argv.includes('--report')
    ? 'report'
    : 'check';

const counts = computeCounts();

if (mode === 'update') {
  writeBaseline(counts);
  console.log('Updated risk-debt baseline:');
  for (const m of METRICS) console.log(`  ${m.label}: ${counts[m.key]}`);
  process.exit(0);
}

const baseline = readBaseline();

console.log('Static risk-debt (application source):');
let failed = false;
let loosened = false;
for (const m of METRICS) {
  const current = counts[m.key];
  const limit = baseline?.counts?.[m.key];
  if (limit === undefined) {
    console.log(`  ${m.label}: ${current} (no baseline yet)`);
    continue;
  }
  if (current > limit) {
    failed = true;
    console.error(`  ✗ ${m.label}: ${current} exceeds baseline ${limit} (+${current - limit})`);
  } else if (current < limit) {
    loosened = true;
    console.log(`  ↓ ${m.label}: ${current} (baseline ${limit} — please re-baseline)`);
  } else {
    console.log(`  ✓ ${m.label}: ${current} (at baseline)`);
  }
}

if (mode === 'report') process.exit(0);

if (!baseline) {
  console.error('\nNo baseline found. Create one with: node scripts/check-risk-debt.mjs --update');
  process.exit(1);
}

if (failed) {
  console.error(
    '\nStatic risk-debt increased. Remove the new occurrences, or if the addition is ' +
      'unavoidable and reviewed, raise the specific baseline in scripts/risk-debt-baseline.json.',
  );
  process.exit(1);
}

if (loosened) {
  console.log(
    '\nDebt dropped below baseline — tighten the ratchet with: node scripts/check-risk-debt.mjs --update',
  );
}

console.log('\nRisk-debt ratchet passed.');
