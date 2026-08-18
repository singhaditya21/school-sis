#!/usr/bin/env node

import {
  canonicalJson,
  RECONCILIATION_DATABASE_URL_ENV,
  redactAuditError,
  runReconciliationCatalogAudit,
} from "./audit-migration-reconciliation";

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error(
      `This command accepts no arguments; provide ${RECONCILIATION_DATABASE_URL_ENV} through the environment.`,
    );
  }
  const report = await runReconciliationCatalogAudit();
  process.stdout.write(`${canonicalJson(report)}\n`);
}

main().catch((error: unknown) => {
  console.error(
    `Migration reconciliation audit failed: ${redactAuditError(
      error,
      process.env[RECONCILIATION_DATABASE_URL_ENV],
    )}`,
  );
  process.exitCode = 1;
});
