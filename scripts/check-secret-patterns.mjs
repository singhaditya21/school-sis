#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const MAX_FILE_BYTES = 1024 * 1024;

const excludedPathFragments = [
  '/.git/',
  '/.next/',
  '/node_modules/',
  '/graphify-out/',
  '/playwright-report/',
  '/test-results/',
  '/.npm-cache/',
  '/.codex/',
];

const excludedExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mov',
]);

const secretPatterns = [
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { name: 'OpenAI API key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { name: 'Stripe live secret key', pattern: /sk_live_[A-Za-z0-9]{16,}/g },
  { name: 'Stripe live restricted key', pattern: /rk_live_[A-Za-z0-9]{16,}/g },
  { name: 'Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'npm token', pattern: /npm_[A-Za-z0-9]{36,}/g },
  { name: 'Private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function shouldScan(file) {
  const normalized = `/${file.replaceAll('\\', '/')}`;
  if (excludedPathFragments.some((fragment) => normalized.includes(fragment))) {
    return false;
  }

  const dotIndex = file.lastIndexOf('.');
  const extension = dotIndex >= 0 ? file.slice(dotIndex).toLowerCase() : '';
  if (excludedExtensions.has(extension)) {
    return false;
  }

  if (!existsSync(file)) {
    return false;
  }

  const stats = statSync(file);
  return stats.isFile() && stats.size <= MAX_FILE_BYTES;
}

function lineNumberForIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

const findings = [];

for (const file of listTrackedFiles()) {
  if (!shouldScan(file)) {
    continue;
  }

  const content = readFileSync(file, 'utf8');

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);

    while (match) {
      findings.push({
        file,
        line: lineNumberForIndex(content, match.index),
        name,
      });

      match = pattern.exec(content);
    }
  }
}

if (findings.length > 0) {
  console.error('Potential committed secrets were found:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.name})`);
  }
  console.error('Remove the value, rotate it if it was real, or narrow the scanner with a reviewed exception.');
  process.exit(1);
}

console.log('Secret pattern scan passed.');
