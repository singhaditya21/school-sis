#!/usr/bin/env node

/**
 * Public-claim guard for the marketing site.
 *
 * The website once advertised a paid tier for an autonomous "26 AI agents"
 * product whose implementation had already been deleted (commit e2791939).
 * docs/sales/README.md and docs/gtm/PILOT_SCOPE_FREEZE.md both ban the claim.
 * This gate fails the build if it returns.
 *
 *   node scripts/check-website-claims.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(REPO_ROOT, 'apps/website/src');

/**
 * Each rule is a claim the product cannot currently support. Keep the pattern
 * narrow enough that honest, hedged copy ("we do NOT act autonomously") passes.
 */
const BANNED = [
  { label: 'Numbered agent-fleet claim', pattern: /\b\d{1,3}\s+(?:native\s+|autonomous\s+)?AI\s+agents?\b/gi },
  { label: 'Autonomous agent capability', pattern: /\bautonomous(?:ly)?\s+(?:AI\s+)?(?:agents?|decision|workflows?|fee|dropout)/gi },
  { label: 'Dropout / churn prediction', pattern: /\b(?:dropout|churn)\s+(?:sentinel|prediction|predictor)/gi },
  { label: 'Named "Sentinel" agent product', pattern: /\bAI\s+Sentinels?\b/gi },
  { label: 'Fee-default prediction claim', pattern: /\bfee\s+default\s+prediction\b/gi },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|mdx?)$/.test(name)) out.push(full);
  }
  return out;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

const findings = [];
for (const file of walk(SCAN_ROOT)) {
  const content = readFileSync(file, 'utf8');
  for (const { label, pattern } of BANNED) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      findings.push({
        file: file.replace(`${REPO_ROOT}/`, ''),
        line: lineOf(content, m.index),
        label,
        text: m[0].replace(/\s+/g, ' ').trim(),
      });
    }
  }
}

if (findings.length > 0) {
  console.error('Unsupported public product claims found on the marketing site:\n');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.label} — "${f.text}"`);
  }
  console.error(
    '\nThese capabilities are not in the product (the agent implementation was removed in e2791939),',
  );
  console.error('and docs/gtm/PILOT_SCOPE_FREEZE.md excludes them. Rewrite the copy, or if the');
  console.error('capability genuinely shipped, narrow the rule in scripts/check-website-claims.mjs.');
  process.exit(1);
}

console.log('Website claim guard passed.');
