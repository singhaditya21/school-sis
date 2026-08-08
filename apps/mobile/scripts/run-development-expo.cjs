'use strict';

const { spawnSync } = require('node:child_process');

const expoCli = require.resolve('expo/bin/cli');
const expoArgs = process.argv.slice(2);
if (expoArgs[0] === '--') expoArgs.shift();

const result = spawnSync(process.execPath, [expoCli, ...expoArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MOBILE_RELEASE_TARGET: 'development',
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
