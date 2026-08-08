import assert from 'node:assert/strict';
import test from 'node:test';

import { findBlockedFiles, isBlocked } from './check-repository-hygiene.mjs';

test('blocks generated session and build artifacts anywhere in the repository', () => {
  const generatedArtifacts = [
    '.agents/AGENTS.md',
    '.agents/worker/handoff.md',
    'apps/web/.agents/session.json',
    'apps/web/tsconfig.tsbuildinfo',
    'apps/website/cache.tsbuildinfo',
    'build.log',
    'apps/web/server.log',
  ];

  for (const file of generatedArtifacts) {
    assert.equal(isBlocked(file), true, `${file} should be blocked`);
  }
});

test('does not overmatch source files and durable documentation', () => {
  const durableFiles = [
    '.github/AGENTS.md',
    'apps/web/tsconfig.json',
    'docs/build-logging.md',
    'scripts/check-repository-hygiene.mjs',
  ];

  for (const file of durableFiles) {
    assert.equal(isBlocked(file), false, `${file} should remain allowed`);
  }
});

test('reports every blocked tracked path without dropping or reordering findings', () => {
  assert.deepEqual(
    findBlockedFiles([
      'README.md',
      '.agents/orchestrator/plan.md',
      'apps/web/tsconfig.tsbuildinfo',
      'server.log',
      'docs/architecture.md',
    ]),
    [
      '.agents/orchestrator/plan.md',
      'apps/web/tsconfig.tsbuildinfo',
      'server.log',
    ],
  );
});
