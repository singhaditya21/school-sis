import assert from 'node:assert/strict';
import test from 'node:test';
import { toolchainProblems } from './check-toolchain.mjs';

test('accepts the pinned Node and pnpm versions', () => {
  assert.deepEqual(
    toolchainProblems({
      nodeVersion: 'v24.8.0',
      userAgent: 'pnpm/9.15.9 npm/? node/v24.8.0 linux x64',
    }),
    [],
  );
});

test('rejects unpinned Node or package managers', () => {
  assert.equal(
    toolchainProblems({ nodeVersion: 'v26.0.0', userAgent: 'npm/11.0.0 node/v26.0.0' }).length,
    2,
  );
});
