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

test("release mode narrowly allows the tenant-context private ACL and rate-policy hardening", () => {
  const root = fixture();
  writeFileSync(
    join(root, "packages/api/src/db/migrations/tenant-rls.sql"),
    `
      CREATE TABLE IF NOT EXISTS app_private.tenant_context_signing_keys (key_id text);
      REVOKE ALL ON TABLE app_private.tenant_context_signing_keys FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS app_private.tenant_context_rollout_state (singleton boolean);
      REVOKE ALL ON TABLE app_private.tenant_context_rollout_state FROM PUBLIC;
      DROP POLICY IF EXISTS rate_limit_buckets_platform_access ON public.rate_limit_buckets;
      CREATE POLICY rate_limit_buckets_platform_only ON public.rate_limit_buckets
        USING (app_private.rls_bypass())
        WITH CHECK (app_private.rls_bypass());
    `,
  );
  assert.deepEqual(
    evaluateMigrationPolicy({ repoRoot: root, releaseMode: true }).failures,
    [],
  );
});

test("tenant-RLS hardening exceptions reject near-miss revokes and policy removal", () => {
  const root = fixture();
  writeFileSync(
    join(root, "packages/api/src/db/migrations/tenant-rls.sql"),
    `
      CREATE TABLE IF NOT EXISTS app_private.tenant_context_signing_keys (key_id text);
      REVOKE ALL ON TABLE public.students FROM PUBLIC;
      DROP POLICY IF EXISTS allow_all ON public.rate_limit_buckets;
      CREATE POLICY rate_limit_buckets_platform_only ON public.rate_limit_buckets
        USING (app_private.rls_bypass())
        WITH CHECK (app_private.rls_bypass());
    `,
  );
  const failures = evaluateMigrationPolicy({
    repoRoot: root,
    releaseMode: true,
  }).failures.join("\n");
  assert.match(failures, /revoke-privilege/u);
  assert.match(failures, /drop-rls-policy/u);
});

const exactPolicyReconciliation = `
  DO $$
  DECLARE table_record record;
  BEGIN
    FOR table_record IN
      SELECT namespaces.nspname AS schema_name, classes.relname AS table_name
      FROM pg_catalog.pg_class classes
      JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
      WHERE namespaces.nspname = 'public'
        AND classes.relkind IN ('r', 'p')
      ORDER BY namespaces.nspname, classes.relname, classes.oid
    LOOP
      EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE', table_record.schema_name, table_record.table_name);
    END LOOP;
  END $$;
  DO $$
  DECLARE policy_record record;
  BEGIN
    FOR policy_record IN
      SELECT namespaces.nspname AS schema_name, classes.relname AS table_name, policies.polname AS policy_name
      FROM pg_catalog.pg_policy policies
      JOIN pg_catalog.pg_class classes ON classes.oid = policies.polrelid
      JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
      WHERE namespaces.nspname = 'public'
        AND classes.relkind IN ('r', 'p')
    LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', policy_record.policy_name, policy_record.schema_name, policy_record.table_name);
    END LOOP;
  END $$;
  EXECUTE format(
    'CREATE POLICY tenant_isolation_policy ON %I.%I
       USING (app_private.rls_bypass() OR tenant_id = (SELECT app_private.current_tenant_id()))
       WITH CHECK (app_private.rls_bypass() OR tenant_id = (SELECT app_private.current_tenant_id()))',
    table_record.schema_name,
    table_record.table_name
  );
`;

test("release mode narrowly accepts locked full-policy reconciliation", () => {
  const root = fixture();
  writeFileSync(
    join(root, "packages/api/src/db/migrations/tenant-rls.sql"),
    exactPolicyReconciliation,
  );
  assert.deepEqual(
    evaluateMigrationPolicy({ repoRoot: root, releaseMode: true }).failures,
    [],
  );
});

test("locked policy exception rejects missing lock order and unrelated dynamic drops", () => {
  const root = fixture();
  writeFileSync(
    join(root, "packages/api/src/db/migrations/tenant-rls.sql"),
    `${exactPolicyReconciliation.replace(
      "ORDER BY namespaces.nspname, classes.relname, classes.oid",
      "ORDER BY classes.oid",
    )}\nEXECUTE format('DROP POLICY %I ON %I.%I', arbitrary.policy, arbitrary.schema, arbitrary.table);`,
  );
  const failures = evaluateMigrationPolicy({
    repoRoot: root,
    releaseMode: true,
  }).failures.join("\n");
  assert.match(failures, /drop-rls-policy/u);
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
