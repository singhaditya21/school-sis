import {
  parseDeploymentTarget,
  runDeploymentMigrations,
} from "./deployment-migrations";

async function main(): Promise<void> {
  const target = parseDeploymentTarget(process.argv.slice(2));
  const result = await runDeploymentMigrations({ target });
  console.info(
    `Deployment migrations complete for ${result.target}: ${result.migrationCount} migrations verified.`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown deployment migration failure.";
  console.error(`Deployment migrations failed: ${message}`);
  process.exitCode = 1;
});
