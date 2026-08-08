#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const blockedExactPaths = new Set([
  'apps/web/pnpm_audit.json',
  'apps/web/test-query.cjs',
  'apps/web/test-schema.cjs',
  'apps/website/package-lock.json',
  'package-lock.json',
]);

const blockedDirectoryNames = new Set(['.agents']);

const blockedSuffixes = [
  '.log',
  '.tsbuildinfo',
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function isBlocked(file) {
  return blockedExactPaths.has(file)
    || file.split('/').some((segment) => blockedDirectoryNames.has(segment))
    || blockedSuffixes.some((suffix) => file.endsWith(suffix));
}

export function findBlockedFiles(files) {
  return files.filter(isBlocked);
}

function run() {
  const findings = findBlockedFiles(trackedFiles());

  if (findings.length > 0) {
    console.error('Generated or policy-blocked files are still tracked:');
    for (const file of findings) {
      console.error(`- ${file}`);
    }
    console.error('Remove these files from Git or update the hygiene gate with a reviewed source-of-truth exception.');
    return 1;
  }

  console.log('Repository hygiene gate passed.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = run();
}
