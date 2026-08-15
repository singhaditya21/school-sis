#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const target = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
if (target !== "preview" && target !== "production") {
  console.error(
    "[vercel-build] VERCEL_TARGET_ENV or VERCEL_ENV must be preview or production.",
  );
  process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args, extraEnv = {}) {
  const result = spawnSync(pnpm, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.info(`[vercel-build] Validating the ${target} deployment contract.`);
run([
  "run",
  "deployment:check",
  "--",
  "--target",
  target,
  ...(target === "production" ? ["--runtime-only"] : []),
]);

// Builds must complete before any command is allowed to mutate a database.
console.info("[vercel-build] Building the Next.js application.");
run(["run", "build"], { DEPLOYMENT_CONTRACT_VALIDATED: "1" });

if (target === "preview") {
  console.info(
    "[vercel-build] Build passed; applying migrations to the isolated preview database.",
  );
  run(["run", "db:migrate:deploy", "--", "--target", "preview"]);
} else {
  console.info(
    "[vercel-build] Production migration is owned by the staged GitHub release workflow; no database mutation performed.",
  );
}
