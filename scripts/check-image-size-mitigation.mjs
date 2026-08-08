#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

if (process.argv.includes('--probe')) {
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let dependencyRequire = createRequire(path.join(workspaceRoot, 'apps/mobile/package.json'));
  for (const dependency of ['react-native', '@react-native/community-cli-plugin', 'metro', 'image-size']) {
    dependencyRequire = createRequire(dependencyRequire.resolve(`${dependency}/package.json`));
  }

  const imageSize = dependencyRequire('image-size');
  const { findBox } = dependencyRequire('./dist/types/utils.js');

  const malformedIcns = Buffer.alloc(16);
  malformedIcns.write('icns', 0, 'ascii');
  malformedIcns.writeUInt32BE(malformedIcns.length, 4);
  malformedIcns.write('ic07', 8, 'ascii');
  malformedIcns.writeUInt32BE(0, 12);
  assert.throws(() => imageSize(malformedIcns), /Invalid ICNS entry length/);

  const zeroLengthBox = Buffer.alloc(12);
  zeroLengthBox.writeUInt32BE(0, 0);
  zeroLengthBox.write('ftyp', 4, 'ascii');
  assert.equal(findBox(zeroLengthBox, 'missing', 0), undefined);
  process.exit(0);
}

const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--probe'], {
  encoding: 'utf8',
  timeout: 2_000,
});
if (probe.error || probe.status !== 0) {
  const detail = probe.error?.code === 'ETIMEDOUT'
    ? 'probe timed out, indicating a possible infinite loop'
    : (probe.stderr || probe.error?.message || `exit ${probe.status}`).trim();
  console.error(`image-size mitigation verification failed: ${detail}`);
  process.exit(1);
}

console.log('image-size ICNS/HEIF/JXL infinite-loop mitigations verified.');
