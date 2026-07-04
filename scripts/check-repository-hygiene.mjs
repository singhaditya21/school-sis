#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const blockedExactPaths = new Set([
  'apps/web/pnpm_audit.json',
  'apps/web/test-query.cjs',
  'apps/web/test-schema.cjs',
  'apps/website/package-lock.json',
  'package-lock.json',
]);

const blockedPrefixes = [
  'apps/web/src/graphify-out/',
  'backend/app/bin/',
  'graphify-out/',
  'services/agents/src/graphify-out/',
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function isBlocked(file) {
  return blockedExactPaths.has(file) || blockedPrefixes.some((prefix) => file.startsWith(prefix));
}

const findings = trackedFiles().filter(isBlocked);

if (findings.length > 0) {
  console.error('Generated or policy-blocked files are still tracked:');
  for (const file of findings) {
    console.error(`- ${file}`);
  }
  console.error('Remove these files from Git or update the hygiene gate with a reviewed source-of-truth exception.');
  process.exit(1);
}

console.log('Repository hygiene gate passed.');
