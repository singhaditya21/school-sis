#!/usr/bin/env node

const EXPECTED_NODE_MAJOR = 24;
const EXPECTED_PNPM_VERSION = '9.15.9';

export function toolchainProblems({ nodeVersion, userAgent }) {
  const problems = [];
  const nodeMajor = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  if (nodeMajor !== EXPECTED_NODE_MAJOR) {
    problems.push(`Node ${EXPECTED_NODE_MAJOR}.x is required; received ${nodeVersion}.`);
  }

  const packageManager = userAgent.trim().split(/\s+/)[0] || 'unknown';
  if (packageManager !== `pnpm/${EXPECTED_PNPM_VERSION}`) {
    problems.push(
      `pnpm ${EXPECTED_PNPM_VERSION} is required through the packageManager/Corepack pin; received ${packageManager}.`,
    );
  }
  return problems;
}

export function checkToolchain(environment = process.env, nodeVersion = process.version) {
  return toolchainProblems({
    nodeVersion,
    userAgent: environment.npm_config_user_agent || '',
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const problems = checkToolchain();
  if (problems.length > 0) {
    console.error(`Toolchain preflight failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    console.error('Run `corepack enable` and then `corepack prepare pnpm@9.15.9 --activate` under Node 24.');
    process.exit(1);
  }
  console.info(`Toolchain preflight passed: Node ${process.versions.node}, pnpm ${EXPECTED_PNPM_VERSION}.`);
}
