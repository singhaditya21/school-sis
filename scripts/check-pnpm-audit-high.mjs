#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const auditPath = process.argv.slice(2).find((arg) => arg !== '--') || 'pnpm-audit-high.json';
const failSeverities = new Set(['high', 'critical']);
const localMitigations = new Map([
  ['GHSA-w3rx-r6r6-pgpr', {
    moduleName: 'image-size',
    versions: new Set(['1.2.1']),
    pathSuffix: 'metro@0.84.4 > image-size@1.2.1',
  }],
  ['GHSA-5p2g-fcmc-qvqq', {
    moduleName: 'image-size',
    versions: new Set(['1.2.1']),
    pathSuffix: 'metro@0.84.4 > image-size@1.2.1',
  }],
]);

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
const highOrCriticalAdvisories = advisories.filter((advisory) =>
  failSeverities.has(String(advisory.severity || '').toLowerCase()),
);
const mitigatedAdvisories = highOrCriticalAdvisories.filter(isLocallyMitigated);
const blockingAdvisories = highOrCriticalAdvisories.filter((advisory) => !isLocallyMitigated(advisory));

console.log(
  [
    'pnpm audit summary:',
    `critical=${vulnerabilities.critical || 0}`,
    `high=${vulnerabilities.high || 0}`,
    `moderate=${vulnerabilities.moderate || 0}`,
    `low=${vulnerabilities.low || 0}`,
  ].join(' '),
);

if (mitigatedAdvisories.length > 0) {
  const probe = spawnSync(process.execPath, ['scripts/check-image-size-mitigation.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (probe.error || probe.status !== 0) {
    console.error('Locally patched dependency verification failed.');
    console.error((probe.stderr || probe.error?.message || `exit ${probe.status}`).trim());
    process.exit(1);
  }
  for (const advisory of mitigatedAdvisories) {
    console.log(
      `Locally mitigated ${advisory.github_advisory_id} for ${advisory.module_name}; exact-version patch probe passed.`,
    );
  }
}

if (blockingAdvisories.length > 0) {
  console.error('High or critical dependency advisories found:');
  for (const advisory of blockingAdvisories) {
    console.error(`- ${advisory.module_name}: ${advisory.title} (${advisory.severity}) ${advisory.url || ''}`);
  }
  process.exit(1);
}

console.log('No unmitigated high or critical dependency advisories found.');

function isLocallyMitigated(advisory) {
  const mitigation = localMitigations.get(advisory.github_advisory_id);
  if (!mitigation || advisory.module_name !== mitigation.moduleName) return false;
  if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) return false;
  return advisory.findings.every((finding) =>
    mitigation.versions.has(finding.version)
    && Array.isArray(finding.paths)
    && finding.paths.length > 0
    && finding.paths.every((path) => path.endsWith(mitigation.pathSuffix)),
  );
}
