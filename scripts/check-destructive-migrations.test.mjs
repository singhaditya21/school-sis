import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  evaluateMigrationPolicy,
  findBackwardIncompatibleStatements,
  parseMaintenanceRecordDocument,
} from "./check-destructive-migrations.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "school-sis-migration-policy-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "apps/web/drizzle/meta"), { recursive: true });
  mkdirSync(join(root, "packages/api/src/db/migrations"), {
    recursive: true,
  });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeJson(join(root, "apps/web/drizzle/meta/_journal.json"), {
    version: "7",
    entries: [
      {
        idx: 0,
        version: "7",
        when: 1_000,
        tag: "0000_contract",
        breakpoints: true,
      },
    ],
  });
  writeFileSync(
    join(root, "packages/api/src/db/migrations/tenant-rls.sql"),
    "ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;\n",
  );
  writeFileSync(
    join(root, "apps/web/drizzle/0000_contract.sql"),
    "ALTER TABLE students ADD COLUMN preferred_name text;\n",
  );
  writeJson(join(root, "scripts/destructive-migration-maintenance.json"), {
    version: 1,
    records: [],
  });
  return root;
}

function maintenanceRecord(root, overrides = {}) {
  const migrationPath = "apps/web/drizzle/0000_contract.sql";
  const source = readFileSync(join(root, migrationPath), "utf8");
  return {
    evidenceUrl:
      "https://github.com/singhaditya21/school-sis/actions/runs/123456789",
    migrationPath,
    migrationTimestamp: 1_000,
    owner: "@release-owner",
    rollbackPlan: "docs/runbooks/contract-rollback.md",
    sha256: createHash("sha256").update(source).digest("hex"),
    ...overrides,
  };
}

test("detects the conservative set of backward-incompatible SQL operations", () => {
  const source = `
    ALTER TABLE students ALTER COLUMN score TYPE bigint;
    ALTER TABLE students ALTER COLUMN email SET NOT NULL;
    ALTER TABLE students ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE students RENAME COLUMN email TO primary_email;
    ALTER TYPE mood RENAME VALUE 'sad' TO 'unhappy';
    ALTER TABLE students SET SCHEMA archive;
    ALTER TABLE students DISABLE ROW LEVEL SECURITY;
    ALTER TABLE students NO FORCE ROW LEVEL SECURITY;
    REVOKE SELECT ON students FROM school_runtime;
    DROP POLICY tenant_policy ON public.students;
  `;
  assert.deepEqual(
    new Set(
      findBackwardIncompatibleStatements(source).map((finding) => finding.kind),
    ),
    new Set([
      "alter-column-type",
      "set-not-null",
      "drop-default",
      "rename-contract",
      "move-schema",
      "weaken-rls",
      "revoke-privilege",
      "drop-rls-policy",
    ]),
  );
});

test("does not treat an atomic same-table RLS policy replacement as removal", () => {
  const findings = findBackwardIncompatibleStatements(`
    DROP POLICY IF EXISTS tenant_policy ON public.students;
    CREATE POLICY tenant_policy ON public.students USING (true);
  `);
  assert.equal(
    findings.some((finding) => finding.kind === "drop-rls-policy"),
    false,
  );
});

test("detects removal of a named policy despite another policy on the table", () => {
  const findings = findBackwardIncompatibleStatements(`
    DROP POLICY IF EXISTS students_delete_policy ON public.students;
    CREATE POLICY students_select_policy ON public.students FOR SELECT USING (true);
  `);
  assert.equal(
    findings.some((finding) => finding.kind === "drop-rls-policy"),
    true,
  );
});

test("the release audit rejects an unrecorded destructive migration", () => {
  const root = fixture();
  writeFileSync(
    join(root, "apps/web/drizzle/0000_contract.sql"),
    "DROP TABLE legacy_students;\n",
  );
  const result = evaluateMigrationPolicy({ repoRoot: root, releaseMode: true });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /drop-object/u);
});

test("a development marker does not bypass the release audit", () => {
  const root = fixture();
  writeFileSync(
    join(root, "apps/web/drizzle/0000_contract.sql"),
    "-- destructive-migration-approved: owner=@release-owner rollback=docs/runbook.md\nDROP TABLE legacy_students;\n",
  );
  assert.deepEqual(evaluateMigrationPolicy({ repoRoot: root }).failures, []);
  assert.equal(
    evaluateMigrationPolicy({ repoRoot: root, releaseMode: true }).failures
      .length,
    1,
  );
});

test("an exact immutable maintenance record permits historical destructive SQL", () => {
  const root = fixture();
  writeFileSync(
    join(root, "apps/web/drizzle/0000_contract.sql"),
    "DROP TABLE legacy_students;\n",
  );
  writeJson(join(root, "scripts/destructive-migration-maintenance.json"), {
    version: 1,
    records: [maintenanceRecord(root)],
  });
  const result = evaluateMigrationPolicy({ repoRoot: root, releaseMode: true });
  assert.deepEqual(result, { failures: [], recordCount: 1 });
});

test("a migration edit invalidates its maintenance record SHA-256", () => {
  const root = fixture();
  const migrationPath = join(root, "apps/web/drizzle/0000_contract.sql");
  writeFileSync(migrationPath, "DROP TABLE legacy_students;\n");
  writeJson(join(root, "scripts/destructive-migration-maintenance.json"), {
    version: 1,
    records: [maintenanceRecord(root)],
  });
  writeFileSync(migrationPath, "DROP TABLE other_students;\n");
  assert.throws(
    () => evaluateMigrationPolicy({ repoRoot: root, releaseMode: true }),
    /stale or tampered SHA-256 digest/u,
  );
});

test("malformed, duplicate, and off-site maintenance evidence fail closed", () => {
  const valid = {
    version: 1,
    records: [
      {
        evidenceUrl:
          "https://github.com/singhaditya21/school-sis/actions/runs/123456789",
        migrationPath: "apps/web/drizzle/0000_contract.sql",
        migrationTimestamp: 1_000,
        owner: "@release-owner",
        rollbackPlan: "docs/runbooks/contract-rollback.md",
        sha256: "a".repeat(64),
      },
    ],
  };
  assert.equal(parseMaintenanceRecordDocument(valid).length, 1);
  assert.throws(
    () =>
      parseMaintenanceRecordDocument({
        ...valid,
        records: [{ ...valid.records[0], unexpected: true }],
      }),
    /must contain exactly/u,
  );
  assert.throws(
    () =>
      parseMaintenanceRecordDocument({
        ...valid,
        records: [
          { ...valid.records[0], evidenceUrl: "https://example.com/run/1" },
        ],
      }),
    /https:\/\/github.com evidence URL/u,
  );
  assert.throws(
    () =>
      parseMaintenanceRecordDocument({
        ...valid,
        records: [valid.records[0], { ...valid.records[0] }],
      }),
    /Duplicate maintenance migrationTimestamp/u,
  );
});
