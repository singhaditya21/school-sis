#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

// A source-only checkout must be buildable without copying a developer's
// secrets or local database. CI uses the same environment-validation bypass;
// runtime and production deployments still validate their real environment.
const packageManagerCli = process.env.npm_execpath;
const command = packageManagerCli
  ? process.execPath
  : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
const args = packageManagerCli
  ? [packageManagerCli, 'run', 'build']
  : ['run', 'build'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SKIP_ENV_VALIDATION: 'true',
  },
});

if (result.error) {
  console.error(`Portable build could not start: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
