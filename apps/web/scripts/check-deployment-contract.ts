import {
  formatDeploymentContractIssue,
  parseDeploymentTarget,
  validateDeploymentContract,
} from "./deployment-contract";

function parseCommandArguments(args: string[]): {
  requestedTarget?: string;
  runtimeOnly: boolean;
} {
  let requestedTarget: string | undefined;
  let runtimeOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--runtime-only") {
      if (runtimeOnly) throw new Error("Duplicate --runtime-only option.");
      runtimeOnly = true;
      continue;
    }
    if (argument === "--target") {
      const value = args[index + 1];
      if (!value || value.startsWith("--") || requestedTarget) {
        throw new Error(
          "--target requires one value and may be provided only once.",
        );
      }
      requestedTarget = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--target=")) {
      if (requestedTarget)
        throw new Error("--target may be provided only once.");
      requestedTarget = argument.slice("--target=".length);
      continue;
    }
    throw new Error(`Unknown deployment contract option: ${argument}`);
  }

  return { requestedTarget, runtimeOnly };
}

let commandArguments: ReturnType<typeof parseCommandArguments>;
try {
  commandArguments = parseCommandArguments(process.argv.slice(2));
} catch (error) {
  console.error(
    `[deploy:error] arguments: ${error instanceof Error ? error.message : "invalid options"}`,
  );
  process.exit(1);
}
const { runtimeOnly } = commandArguments;
const requestedTarget =
  commandArguments.requestedTarget ||
  process.env.VERCEL_TARGET_ENV ||
  process.env.VERCEL_ENV;
const target = parseDeploymentTarget(requestedTarget);

if (!target) {
  console.error(
    "[deploy:error] target: pass --target preview or --target production.",
  );
  process.exitCode = 1;
} else if (runtimeOnly && target !== "production") {
  console.error(
    "[deploy:error] runtime-only: may be used only for a production build.",
  );
  process.exitCode = 1;
} else {
  const result = validateDeploymentContract(process.env, target, {
    runtimeOnly,
  });
  for (const issue of result.issues) {
    console.error(formatDeploymentContractIssue(issue));
  }

  if (!result.ok) {
    console.error(
      `[deploy] ${target} deployment contract failed with ${result.issues.length} issue(s).`,
    );
    process.exitCode = 1;
  } else {
    console.info(
      runtimeOnly
        ? `[deploy] ${target} runtime-only build contract passed; migration credentials remain outside the build.`
        : `[deploy] ${target} deployment contract passed; direct database source: ${result.directDatabaseVariable}.`,
    );
  }
}
