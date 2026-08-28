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

/**
 * Match the whole advisory call INCLUDING its seed and the argument it binds.
 *
 * An earlier version matched only the function name, which let three different
 * mutations through: changing the seed to `hashtextextended($1, 1)`, appending
 * `$1::text`, and — worst — keeping the SQL verbatim while binding a different
 * constant. That last one is silent in production too: pg_advisory_xact_lock
 * blocks, its result is never inspected, and the marker has no unlock to
 * disagree with. So the seed and the bound value are both pinned here.
 */
const ADVISORY_CALL =
  /pg_(?:try_)?advisory_(?:xact_)?(?:un)?lock\(\s*(hashtext(?:extended)?)\((\$1[^)]*)\)\s*\)[^"]*"[\s\S]{0,80}?\[\s*([A-Za-z_.][\w.]*)\s*[,\]]/g;

interface AdvisoryCall {
  hash: string;
  argument: string;
  bound: string;
}

const advisoryCalls = (source: string): AdvisoryCall[] =>
  [...source.matchAll(ADVISORY_CALL)].map((match) => ({
    hash: match[1],
    argument: match[2],
    bound: match[3],
  }));

/** The identifiers each file legitimately binds for the shared lock name. */
const LOCK_NAME_BINDINGS = new Set([
  "DEPLOYMENT_MIGRATION_LOCK_NAME",
  "resolved.lockName",
  "lockName",
]);

describe("deployment migration advisory lock", () => {
  it("hashes the shared lock name identically at every call site", () => {
    const calls = [...advisoryCalls(runner), ...advisoryCalls(marker)];

    // Guard the guard: a regex that matches nothing would pass vacuously. The
    // runner acquires and unlocks; the marker takes one transaction lock.
    expect(advisoryCalls(runner).length).toBe(2);
    expect(advisoryCalls(marker).length).toBe(1);

    expect(new Set(calls.map((c) => c.hash))).toEqual(
      new Set(["hashtextextended"]),
    );
  });

  it("uses the same seed at every call site", () => {
    // hashtextextended($1, 1) is a different key from hashtextextended($1, 0),
    // and looks close enough to read as identical.
    for (const call of [...advisoryCalls(runner), ...advisoryCalls(marker)]) {
      expect(call.argument.replace(/\s+/g, "")).toBe("$1,0");
    }
  });

  it("binds the shared lock name, not merely a well-shaped expression", () => {
    for (const call of [...advisoryCalls(runner), ...advisoryCalls(marker)]) {
      expect(LOCK_NAME_BINDINGS.has(call.bound)).toBe(true);
    }
    // And the marker binds the runner's own exported constant, so the two
    // cannot drift apart by editing one file.
    expect(advisoryCalls(marker)[0].bound).toBe(
      "DEPLOYMENT_MIGRATION_LOCK_NAME",
    );
    // ...imported from the runner's own module, so the two cannot drift apart
    // by editing one file.
    expect(marker).toMatch(
      /import\s*\{[^}]*\bDEPLOYMENT_MIGRATION_LOCK_NAME\b[^}]*\}\s*from\s*"\.\/deployment-migrations"/,
    );
  });

  it("never reintroduces the int4 hashtext variant", () => {
    for (const source of [runner, marker]) {
      expect(source).not.toMatch(/advisory_[a-z_]*lock\(\s*hashtext\(/);
    }
  });
});
