import { evaluateMigrationLedger } from "@/lib/observability/migration-health";

const expected = [
  { tag: "0000_base", createdAt: "100", hash: "hash-100" },
  { tag: "0001_feature", createdAt: "200", hash: "hash-200" },
] as const;

describe("migration ledger health", () => {
  it("accepts only the exact ordered migration set", () => {
    expect(
      evaluateMigrationLedger(expected, [
        { createdAt: "100", hash: "hash-100" },
        { createdAt: "200", hash: "hash-200" },
      ]),
    ).toEqual(
      expect.objectContaining({
        status: "healthy",
        reason: "current",
        expectedCount: 2,
        appliedCount: 2,
        expectedLatest: "200",
        appliedLatest: "200",
      }),
    );
  });

  it.each([
    ["a missing ledger", null, "migration_table_missing"],
    [
      "a partial ledger",
      [{ createdAt: "100", hash: "hash-100" }],
      "migration_count_mismatch",
    ],
    [
      "an unknown timestamp",
      [{ createdAt: "999", hash: "hash-999" }],
      "unknown_migration",
    ],
    [
      "a changed migration",
      [
        { createdAt: "100", hash: "changed" },
        { createdAt: "200", hash: "hash-200" },
      ],
      "migration_hash_mismatch",
    ],
    [
      "a duplicate timestamp",
      [
        { createdAt: "100", hash: "hash-100" },
        { createdAt: "100", hash: "hash-100" },
      ],
      "duplicate_migration_timestamp",
    ],
  ])("rejects %s", (_label, applied, reason) => {
    expect(evaluateMigrationLedger(expected, applied)).toEqual(
      expect.objectContaining({
        status: "unhealthy",
        reason,
      }),
    );
  });
});
