import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The migration runner and the promotion marker share
 * DEPLOYMENT_MIGRATION_LOCK_NAME so that a release cannot record a promotion
 * while a migration is mid-flight. Sharing the name only excludes anything if
 * both sides hash it the same way.
 *
 * They did not. `hashtext` returns int4 and `hashtextextended` int8, so for
 * "school-sis:deployment-migrations:v1" the marker took key 26945508 while the
 * runner took 7973690206200735716 — different advisory locks entirely. Verified
 * against PostgreSQL 16.14: while one session held the runner's lock,
 * `pg_try_advisory_xact_lock(hashtext(K))` still returned true, where the same
 * probe with hashtextextended correctly returned false.
 *
 * The two hashes agree in their low 32 bits, so `pg_locks` showed a matching
 * objid and the mismatch read as agreement. That is why this is a text
 * assertion rather than a runtime one: the bug is invisible at the point where
 * anyone would look for it.
 */
const runner = readFileSync(
  resolve(process.cwd(), "scripts/deployment-migrations.ts"),
  "utf8",
);
const marker = readFileSync(
  resolve(process.cwd(), "scripts/mark-tenant-context-runtime.ts"),
  "utf8",
);

const ADVISORY_CALL =
  /pg_(?:try_)?advisory_(?:xact_)?(?:un)?lock\(\s*(hashtext(?:extended)?)\(\$1(?:,\s*0)?\)/g;

const advisoryHashFunctions = (source: string): string[] =>
  [...source.matchAll(ADVISORY_CALL)].map((match) => match[1]);

describe("deployment migration advisory lock", () => {
  it("hashes the shared lock name identically at every call site", () => {
    const runnerHashes = advisoryHashFunctions(runner);
    const markerHashes = advisoryHashFunctions(marker);

    // Guard the guard: a regex that matches nothing would pass vacuously.
    expect(runnerHashes.length).toBeGreaterThan(0);
    expect(markerHashes.length).toBeGreaterThan(0);

    expect(new Set([...runnerHashes, ...markerHashes])).toEqual(
      new Set(["hashtextextended"]),
    );
  });

  it("never reintroduces the int4 hashtext variant", () => {
    for (const source of [runner, marker]) {
      expect(source).not.toMatch(/advisory_[a-z_]*lock\(\s*hashtext\(/);
    }
  });

  it("keeps both call sites on the one shared lock name", () => {
    expect(runner).toContain("DEPLOYMENT_MIGRATION_LOCK_NAME");
    expect(marker).toContain("DEPLOYMENT_MIGRATION_LOCK_NAME");
  });
});
