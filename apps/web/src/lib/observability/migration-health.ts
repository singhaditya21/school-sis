export type ExpectedMigration = {
  createdAt: string;
  hash: string;
  tag?: string;
};

export type AppliedMigration = {
  createdAt: string;
  hash: string;
};

export type MigrationHealthReason =
  | "current"
  | "migration_table_missing"
  | "migration_count_mismatch"
  | "duplicate_migration_timestamp"
  | "unknown_migration"
  | "migration_hash_mismatch"
  | "migration_check_failed";

export type MigrationHealth = {
  status: "healthy" | "unhealthy";
  reason: MigrationHealthReason;
  expectedCount: number;
  appliedCount: number | null;
  expectedLatest: string | null;
  appliedLatest: string | null;
};

function latestTimestamp(
  migrations: Array<{ createdAt: string }>,
): string | null {
  return migrations.reduce<string | null>((latest, migration) => {
    if (latest === null || BigInt(migration.createdAt) > BigInt(latest))
      return migration.createdAt;
    return latest;
  }, null);
}

function unhealthy(
  reason: Exclude<MigrationHealthReason, "current">,
  expected: readonly ExpectedMigration[],
  applied: AppliedMigration[] | null,
): MigrationHealth {
  return {
    status: "unhealthy",
    reason,
    expectedCount: expected.length,
    appliedCount: applied?.length ?? null,
    expectedLatest: latestTimestamp([...expected]),
    appliedLatest: applied ? latestTimestamp(applied) : null,
  };
}

export function evaluateMigrationLedger(
  expected: readonly ExpectedMigration[],
  applied: AppliedMigration[] | null,
): MigrationHealth {
  if (applied === null)
    return unhealthy("migration_table_missing", expected, applied);

  const timestamps = new Set(applied.map((migration) => migration.createdAt));
  if (timestamps.size !== applied.length) {
    return unhealthy("duplicate_migration_timestamp", expected, applied);
  }

  const expectedByTimestamp = new Map(
    expected.map((migration) => [migration.createdAt, migration]),
  );
  for (const migration of applied) {
    const matching = expectedByTimestamp.get(migration.createdAt);
    if (!matching) return unhealthy("unknown_migration", expected, applied);
    if (matching.hash !== migration.hash) {
      return unhealthy("migration_hash_mismatch", expected, applied);
    }
  }

  if (applied.length !== expected.length) {
    return unhealthy("migration_count_mismatch", expected, applied);
  }

  return {
    status: "healthy",
    reason: "current",
    expectedCount: expected.length,
    appliedCount: applied.length,
    expectedLatest: latestTimestamp([...expected]),
    appliedLatest: latestTimestamp(applied),
  };
}

export function migrationCheckFailure(
  expected: readonly ExpectedMigration[],
): MigrationHealth {
  return unhealthy("migration_check_failed", expected, null);
}
