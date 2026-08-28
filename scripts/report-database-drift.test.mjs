import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeDrift,
  manifestTagsAt,
  parseArgs,
} from '../apps/web/scripts/report-database-drift.mjs';

/**
 * The one fact an operator needs after a rollback — is the database ahead of the
 * code, and by what — stated correctly in each of the three states it can be in.
 */

const MANIFEST = [
  { tag: '0000_init_baseline', hash: 'aaa' },
  { tag: '0001_reconcile', hash: 'bbb' },
  { tag: '0002_invoice_billing', hash: 'ccc' },
];

test('names the migrations the running code does not know about', () => {
  const drift = describeDrift({
    appliedHashes: ['aaa', 'bbb', 'ccc'],
    liveTags: ['0000_init_baseline', '0001_reconcile'],
    attemptedManifest: MANIFEST,
  });
  assert.equal(drift.known, true);
  assert.deepEqual(drift.ahead, ['0002_invoice_billing']);
  const text = drift.lines.join('\n');
  assert.match(text, /THE DATABASE IS AHEAD OF THE RUNNING CODE/);
  assert.match(text, /- 0002_invoice_billing/);
  // It must not imply the rollback can be undone by re-running something.
  assert.match(text, /manual decision/);
});

test('says plainly when schema and code agree', () => {
  const drift = describeDrift({
    appliedHashes: ['aaa', 'bbb'],
    liveTags: ['0000_init_baseline', '0001_reconcile'],
    attemptedManifest: MANIFEST,
  });
  assert.deepEqual(drift.ahead, []);
  assert.match(drift.lines.join('\n'), /Schema and code agree/);
});

test('reports UNKNOWN rather than guessing when the live manifest is unreadable', () => {
  // A shallow clone, or a deployment predating the manifest. Claiming agreement
  // here would be the most dangerous possible answer.
  const drift = describeDrift({
    appliedHashes: ['aaa', 'bbb'],
    liveTags: null,
    attemptedManifest: MANIFEST,
  });
  assert.equal(drift.known, false);
  const text = drift.lines.join('\n');
  assert.match(text, /UNKNOWN/);
  assert.doesNotMatch(text, /agree/);
});

test('still names an applied migration the attempted manifest cannot resolve', () => {
  // A hash with no manifest entry is reported as a hash, not dropped.
  const drift = describeDrift({
    appliedHashes: ['aaa', 'unmapped'],
    liveTags: ['0000_init_baseline'],
    attemptedManifest: MANIFEST,
  });
  assert.deepEqual(drift.ahead, ['<hash unmapped>']);
});

test('reads the manifest of a specific commit, not the working tree', () => {
  const calls = [];
  const tags = manifestTagsAt('abc1234', (args) => {
    calls.push(args);
    return '[{ "tag": "0000_init_baseline", "createdAt": "1", "hash": "aaa" }]';
  });
  assert.deepEqual(tags, ['0000_init_baseline']);
  assert.match(calls[0].join(' '), /show abc1234:apps\/web\/src\/generated\/migration-manifest\.ts/);
});

test('returns null rather than throwing when the commit has no manifest', () => {
  const tags = manifestTagsAt('abc1234', () => {
    throw new Error('fatal: path does not exist');
  });
  assert.equal(tags, null);
});

test('rejects a sha that is not a sha, without shelling out', () => {
  let called = false;
  const tags = manifestTagsAt('main; rm -rf /', () => {
    called = true;
    return '';
  });
  assert.equal(tags, null);
  assert.equal(called, false);
});

test('requires a database connection string', () => {
  assert.throws(() => parseArgs(['--live-sha', 'abc'], {}), /DIRECT_URL or DATABASE_URL/);
});
