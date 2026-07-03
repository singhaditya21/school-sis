#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const auditPath = process.argv[2] || 'pnpm-audit-high.json';
const failSeverities = new Set(['high', 'critical']);

function readAuditReport(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Unable to read pnpm audit report at ${path}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const report = readAuditReport(auditPath);
const vulnerabilities = report.metadata?.vulnerabilities || {};
const advisories = Object.values(report.advisories || {});
const blockingAdvisories = advisories.filter((advisory) => failSeverities.has(String(advisory.severity || '').toLowerCase()));

console.log(
  [
    'pnpm audit summary:',
    `critical=${vulnerabilities.critical || 0}`,
    `high=${vulnerabilities.high || 0}`,
    `moderate=${vulnerabilities.moderate || 0}`,
    `low=${vulnerabilities.low || 0}`,
  ].join(' '),
);

if (blockingAdvisories.length > 0) {
  console.error('High or critical dependency advisories found:');
  for (const advisory of blockingAdvisories) {
    console.error(`- ${advisory.module_name}: ${advisory.title} (${advisory.severity}) ${advisory.url || ''}`);
  }
  process.exit(1);
}

console.log('No high or critical dependency advisories found.');
