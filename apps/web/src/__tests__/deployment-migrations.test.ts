import {
  acquireMigrationLock,
  applyDeploymentSchemaTransaction,
  assertProductionDestructiveMigrationPolicy,
  assertDeploymentRuntimeRoleIsSafe,
  assertDeploymentRuntimeRolePrivileges,
  assertMigrationLedger,
  assertNoEmbeddedTransactionControl,
  assertRlsCoverage,
  findBackwardIncompatibleSql,
  normalizeExpectedMigrations,
  parseDestructiveMigrationMaintenanceRecords,
  parseDeploymentTarget,
  resolveDeploymentConnection,
  resolveDeploymentRuntimeRole,
  withDeploymentTransaction,
  withMigrationLock,
  type DeploymentRuntimeRoleAttributes,
  type DeploymentRuntimeRolePrivileges,
  type DeploymentMigration,
  type DestructiveMigrationMaintenanceRecord,
  type ExpectedMigration,
  type MigrationDatabaseState,
  type RlsCoverageRow,
} from "../../scripts/deployment-migrations";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function expectedMigrations(): ExpectedMigration[] {
  return normalizeExpectedMigrations([
    { folderMillis: 1_000, hash: HASH_A },
    { folderMillis: 2_000, hash: HASH_B },
    { folderMillis: 3_000, hash: HASH_C },
  ]);
}

function databaseState(
  rows: Array<{ created_at: unknown; hash: unknown }>,
  overrides: Partial<MigrationDatabaseState> = {},
): MigrationDatabaseState {
  return {
    ledgerExists: true,
    ledgerRows: rows,
    publicSchemaNonEmpty: rows.length > 0,
    ...overrides,
  };
}

const DIRECT_NEON_URL =
  "postgresql://school_owner:secret@ep-school.us-east-1.aws.neon.tech/school?sslmode=verify-full&channel_binding=require";

const SAFE_RUNTIME_ROLE: DeploymentRuntimeRoleAttributes = {
  role_name: "school_runtime",
  migration_owner: "school_owner",
  can_login: true,
  is_superuser: false,
  bypass_rls: false,
  create_role: false,
  create_db: false,
  replication: false,
  has_role_memberships: false,
  owns_current_database: false,
  owns_public_schema: false,
  owns_drizzle_schema: false,
  owns_app_private_schema: false,
  owns_public_or_drizzle_relations: false,
  owns_public_or_drizzle_functions: false,
  owns_app_private_functions: false,
  can_create_in_public_schema: false,
  can_create_in_drizzle_schema: false,
  can_create_in_app_private_schema: false,
};

const COMPLETE_RUNTIME_PRIVILEGES: DeploymentRuntimeRolePrivileges = {
  public_schema_usage: true,
  drizzle_schema_usage: true,
  app_private_schema_usage: true,
  public_tables_dml: true,
  public_sequences_usage: true,
  migration_ledger_select: true,
  public_tables_only_dml: true,
  migration_ledger_only_select: true,
  required_app_private_function_execute: true,
  only_required_app_private_function_execute: true,
  default_table_privileges: true,
  default_table_privileges_only_dml: true,
  default_sequence_privileges: true,
  default_app_private_functions_restricted: true,
};

describe("deployment migration target parsing", () => {
  it.each([
    [["--target=ci"], "ci"],
    [["--target", "preview"], "preview"],
    [["production"], "production"],
    [["--", "--target=production"], "production"],
  ] as const)("parses %j", (arguments_, expected) => {
    expect(parseDeploymentTarget(arguments_)).toBe(expected);
  });

  it.each([
    { arguments_: [] },
    { arguments_: ["--target"] },
    { arguments_: ["--target=staging"] },
    { arguments_: ["--target=ci", "--target=production"] },
    { arguments_: ["--target=ci", "--unexpected"] },
  ])(
    "rejects an invalid or ambiguous target: $arguments_",
    ({ arguments_ }) => {
      expect(() => parseDeploymentTarget(arguments_)).toThrow();
    },
  );
});

describe("deployment migration connection contract", () => {
  it("requires and accepts a direct Neon URL for preview", () => {
    expect(
      resolveDeploymentConnection("preview", {
        DIRECT_URL: DIRECT_NEON_URL,
        DATABASE_URL: DIRECT_NEON_URL.replace(
          "ep-school.",
          "ep-school-pooler.",
        ),
        DATABASE_SSL_MODE: "verify-full",
      }),
    ).toMatchObject({
      hostname: "ep-school.us-east-1.aws.neon.tech",
      source: "DIRECT_URL",
      sslMode: "verify-full",
    });
  });

  it("uses the managed integration unpooled variable when DIRECT_URL is absent", () => {
    expect(
      resolveDeploymentConnection("production", {
        DATABASE_URL_UNPOOLED: DIRECT_NEON_URL,
      }).source,
    ).toBe("DATABASE_URL_UNPOOLED");
  });

  it("does not fall back to the runtime DATABASE_URL outside CI", () => {
    expect(() =>
      resolveDeploymentConnection("production", {
        DATABASE_URL: DIRECT_NEON_URL,
      }),
    ).toThrow("require DIRECT_URL or DATABASE_URL_UNPOOLED");
  });

  it.each([
    [
      "pooled Neon",
      DIRECT_NEON_URL.replace("ep-school.", "ep-school-pooler."),
      "pooled Neon URL",
    ],
    [
      "local",
      "postgresql://postgres:secret@localhost:5432/school?sslmode=disable",
      "cannot target a local database",
    ],
    [
      "non-Neon",
      "postgresql://postgres:secret@db.example.com:5432/school?sslmode=verify-full",
      "direct Neon hostname",
    ],
  ])("rejects a %s production URL", (_label, url, error) => {
    expect(() =>
      resolveDeploymentConnection("production", {
        DIRECT_URL: url,
        DATABASE_SSL_MODE: "verify-full",
      }),
    ).toThrow(error);
  });

  it.each(["disable", "require"] as const)(
    "rejects DATABASE_SSL_MODE=%s remotely",
    (mode) => {
      expect(() =>
        resolveDeploymentConnection("preview", {
          DIRECT_URL: DIRECT_NEON_URL,
          DATABASE_SSL_MODE: mode,
        }),
      ).toThrow("require DATABASE_SSL_MODE=verify-full");
    },
  );

  it.each(["disable", "require", "verify-ca"])(
    "rejects sslmode=%s in a remote URL",
    (mode) => {
      expect(() =>
        resolveDeploymentConnection("preview", {
          DIRECT_URL: DIRECT_NEON_URL.replace(
            "sslmode=verify-full",
            `sslmode=${mode}`,
          ),
        }),
      ).toThrow("sslmode=verify-full");
    },
  );

  it.each([
    "host=localhost",
    "HOST=localhost",
    "port=5432",
    "User=other_owner",
    "password=other_secret",
    "database=other_database",
    "db=other_database",
    "options=-c%20search_path%3Devil",
  ])("rejects the connection identity query override %s", (override) => {
    expect(() =>
      resolveDeploymentConnection("production", {
        DIRECT_URL: `${DIRECT_NEON_URL}&${override}`,
      }),
    ).toThrow("forbidden query override");
  });

  it("allows a local CI database and the ordinary DATABASE_URL fallback", () => {
    const connection = resolveDeploymentConnection("ci", {
      DATABASE_URL:
        "postgresql://postgres:secret@127.0.0.1:5432/school?sslmode=disable",
      DATABASE_SSL_MODE: "disable",
    });
    expect(connection).toMatchObject({
      hostname: "127.0.0.1",
      source: "DATABASE_URL",
      sslMode: "disable",
    });
  });

  it("still rejects pooled and arbitrary remote databases for CI", () => {
    expect(() =>
      resolveDeploymentConnection("ci", {
        DIRECT_URL: DIRECT_NEON_URL.replace("ep-school.", "ep-school-pooler."),
      }),
    ).toThrow("pooled Neon URL");
    expect(() =>
      resolveDeploymentConnection("ci", {
        DIRECT_URL:
          "postgresql://postgres:secret@db.example.com/school?sslmode=verify-full",
      }),
    ).toThrow("direct Neon hostname");
  });
});

describe("deployment runtime role contract", () => {
  it("requires DEPLOYMENT_RUNTIME_ROLE for preview and production but permits CI to omit it", () => {
    expect(resolveDeploymentRuntimeRole("ci", {})).toBeUndefined();
    expect(() => resolveDeploymentRuntimeRole("preview", {})).toThrow(
      "preview deployment migrations require DEPLOYMENT_RUNTIME_ROLE",
    );
    expect(() => resolveDeploymentRuntimeRole("production", {})).toThrow(
      "production deployment migrations require DEPLOYMENT_RUNTIME_ROLE",
    );
    expect(
      resolveDeploymentRuntimeRole("production", {
        DEPLOYMENT_RUNTIME_ROLE: " school_runtime ",
      }),
    ).toBe("school_runtime");
  });

  it.each([
    "9school_runtime",
    "school-runtime",
    "SchoolRuntime",
    "school.runtime",
    "school runtime",
    'runtime"role',
    `r${"x".repeat(63)}`,
  ])("rejects unsafe PostgreSQL role identifier %j", (runtimeRole) => {
    expect(() =>
      resolveDeploymentRuntimeRole("production", {
        DEPLOYMENT_RUNTIME_ROLE: runtimeRole,
      }),
    ).toThrow("must be a lowercase PostgreSQL identifier");
  });

  it("accepts a separate role with no elevated PostgreSQL attributes", () => {
    expect(
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", [
        SAFE_RUNTIME_ROLE,
      ]),
    ).toEqual(SAFE_RUNTIME_ROLE);
  });

  it("requires LOGIN remotely while allowing a CI-only group role", () => {
    const noLoginRole = { ...SAFE_RUNTIME_ROLE, can_login: false };
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("preview", "school_runtime", [
        noLoginRole,
      ]),
    ).toThrow("must have LOGIN for preview");
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", [
        noLoginRole,
      ]),
    ).toThrow("must have LOGIN for production");
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("ci", "school_runtime", [noLoginRole]),
    ).not.toThrow();
  });

  it.each([
    ["is_superuser", "SUPERUSER"],
    ["bypass_rls", "BYPASSRLS"],
    ["create_role", "CREATEROLE"],
    ["create_db", "CREATEDB"],
    ["replication", "REPLICATION"],
    ["has_role_memberships", "role membership"],
    ["owns_current_database", "ownership of the current database"],
    ["owns_public_schema", "ownership of schema public"],
    ["owns_drizzle_schema", "ownership of schema drizzle"],
    ["owns_app_private_schema", "ownership of schema app_private"],
    [
      "owns_public_or_drizzle_relations",
      "ownership of public/drizzle relations or sequences",
    ],
    [
      "owns_public_or_drizzle_functions",
      "ownership of public/drizzle functions",
    ],
    ["owns_app_private_functions", "ownership of app_private functions"],
    ["can_create_in_public_schema", "CREATE on schema public"],
    ["can_create_in_drizzle_schema", "CREATE on schema drizzle"],
    ["can_create_in_app_private_schema", "CREATE on schema app_private"],
  ] as const)("rejects the unsafe %s attribute", (attribute, label) => {
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", [
        {
          ...SAFE_RUNTIME_ROLE,
          [attribute]: true,
        },
      ]),
    ).toThrow(label);
  });

  it("rejects an absent, mismatched, or migration-owner runtime role", () => {
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", []),
    ).toThrow("exactly one existing PostgreSQL role");
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", [
        {
          ...SAFE_RUNTIME_ROLE,
          role_name: "different_runtime",
        },
      ]),
    ).toThrow("Could not verify");
    expect(() =>
      assertDeploymentRuntimeRoleIsSafe("production", "school_runtime", [
        {
          ...SAFE_RUNTIME_ROLE,
          migration_owner: "school_runtime",
        },
      ]),
    ).toThrow("separate from the migration owner");
  });

  it("fails closed when any required runtime privilege is not verified", () => {
    expect(() =>
      assertDeploymentRuntimeRolePrivileges("school_runtime", [
        COMPLETE_RUNTIME_PRIVILEGES,
      ]),
    ).not.toThrow();
    expect(() =>
      assertDeploymentRuntimeRolePrivileges("school_runtime", [
        {
          ...COMPLETE_RUNTIME_PRIVILEGES,
          public_tables_dml: false,
        },
      ]),
    ).toThrow("DML on all public tables");
    expect(() =>
      assertDeploymentRuntimeRolePrivileges("school_runtime", [
        {
          ...COMPLETE_RUNTIME_PRIVILEGES,
          app_private_schema_usage: false,
          required_app_private_function_execute: false,
        },
      ]),
    ).toThrow("USAGE on schema app_private");
    expect(() =>
      assertDeploymentRuntimeRolePrivileges("school_runtime", []),
    ).toThrow("Could not verify privileges");
  });

  it.each([
    ["public_tables_only_dml", "only DML on public tables"],
    [
      "migration_ledger_only_select",
      "only SELECT on drizzle.__drizzle_migrations",
    ],
    ["default_table_privileges_only_dml", "only default public table DML"],
    [
      "only_required_app_private_function_execute",
      "only required app_private function EXECUTE",
    ],
    [
      "default_app_private_functions_restricted",
      "restricted default app_private function privileges",
    ],
  ] as const)("rejects excess privileges when %s fails", (field, message) => {
    expect(() =>
      assertDeploymentRuntimeRolePrivileges("school_runtime", [
        {
          ...COMPLETE_RUNTIME_PRIVILEGES,
          [field]: false,
        },
      ]),
    ).toThrow(message);
  });
});

describe("deployment migration file and ledger validation", () => {
  it("requires unique, increasing timestamps and unique exact SHA-256 hashes", () => {
    expect(() => normalizeExpectedMigrations([])).toThrow(
      "No deployment migration files",
    );
    expect(() =>
      normalizeExpectedMigrations([
        { folderMillis: 2_000, hash: HASH_A },
        { folderMillis: 1_000, hash: HASH_B },
      ]),
    ).toThrow("strictly increasing");
    expect(() =>
      normalizeExpectedMigrations([
        { folderMillis: 1_000, hash: HASH_A },
        { folderMillis: 2_000, hash: HASH_A },
      ]),
    ).toThrow("Duplicate migration hash");
    expect(() =>
      normalizeExpectedMigrations([
        { folderMillis: 1_000, hash: "not-a-hash" },
      ]),
    ).toThrow("lowercase SHA-256");
  });

  it("accepts a fresh empty schema and an exact applied prefix", () => {
    const expected = expectedMigrations();
    expect(
      assertMigrationLedger(
        expected,
        databaseState([], {
          ledgerExists: false,
          publicSchemaNonEmpty: false,
        }),
        "preflight",
      ),
    ).toBe(0);
    expect(
      assertMigrationLedger(
        expected,
        databaseState([
          { created_at: "1000", hash: HASH_A },
          { created_at: 2_000, hash: HASH_B },
        ]),
        "preflight",
      ),
    ).toBe(2);
  });

  it("refuses to adopt a non-empty schema with no migration history", () => {
    const expected = expectedMigrations();
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([], {
          ledgerExists: false,
          publicSchemaNonEmpty: true,
        }),
        "preflight",
      ),
    ).toThrow("Refusing to adopt");
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([], {
          ledgerExists: true,
          publicSchemaNonEmpty: true,
        }),
        "preflight",
      ),
    ).toThrow("Refusing to adopt");
  });

  it("rejects unknown, mismatched, duplicate, and non-prefix ledger entries", () => {
    const expected = expectedMigrations();
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([{ created_at: 999, hash: HASH_A }]),
        "preflight",
      ),
    ).toThrow("Unknown migration ledger timestamp");
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([{ created_at: 1_000, hash: HASH_B }]),
        "preflight",
      ),
    ).toThrow("Migration hash mismatch");
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([
          { created_at: 1_000, hash: HASH_A },
          { created_at: 1_000, hash: HASH_A },
        ]),
        "preflight",
      ),
    ).toThrow("Duplicate migration ledger timestamp");
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([{ created_at: 2_000, hash: HASH_B }]),
        "preflight",
      ),
    ).toThrow("exact prefix");
  });

  it("refuses the historical 0000-0016 ledger instead of auto-adopting the new baseline", () => {
    const resetBaseline = normalizeExpectedMigrations([
      { folderMillis: 1_784_378_219_195, hash: HASH_A },
    ]);
    const historicalLedger = databaseState([
      { created_at: "1784315203159", hash: HASH_B },
    ]);

    expect(() =>
      assertMigrationLedger(resetBaseline, historicalLedger, "preflight"),
    ).toThrow("Unknown migration ledger timestamp");
  });

  it("requires the postflight ledger to exactly equal the local migration chain", () => {
    const expected = expectedMigrations();
    expect(() =>
      assertMigrationLedger(
        expected,
        databaseState([
          { created_at: 1_000, hash: HASH_A },
          { created_at: 2_000, hash: HASH_B },
        ]),
        "postflight",
      ),
    ).toThrow("does not exactly match");

    expect(
      assertMigrationLedger(
        expected,
        databaseState([
          { created_at: 1_000, hash: HASH_A },
          { created_at: 2_000, hash: HASH_B },
          { created_at: 3_000, hash: HASH_C },
        ]),
        "postflight",
      ),
    ).toBe(3);
  });

  it("rejects an internally inconsistent ledger state", () => {
    expect(() =>
      assertMigrationLedger(
        expectedMigrations(),
        databaseState([{ created_at: 1_000, hash: HASH_A }], {
          ledgerExists: false,
        }),
        "preflight",
      ),
    ).toThrow("ledger table is absent");
  });
});

describe("production destructive-migration policy", () => {
  const SAFE_SQL = "ALTER TABLE students ADD COLUMN preferred_name text;";
  const DESTRUCTIVE_SQL =
    "ALTER TABLE students ALTER COLUMN preferred_name SET NOT NULL;";

  function deploymentMigration(
    overrides: Partial<DeploymentMigration> = {},
  ): DeploymentMigration {
    return {
      folderMillis: 2_000,
      hash: HASH_B,
      migrationPath: "apps/web/drizzle/0001_contract_students.sql",
      sql: DESTRUCTIVE_SQL,
      statements: [DESTRUCTIVE_SQL],
      ...overrides,
    };
  }

  function maintenanceRecord(
    overrides: Partial<DestructiveMigrationMaintenanceRecord> = {},
  ): DestructiveMigrationMaintenanceRecord {
    return {
      evidenceUrl:
        "https://github.com/singhaditya21/school-sis/actions/runs/123456789",
      migrationPath: "apps/web/drizzle/0001_contract_students.sql",
      migrationTimestamp: 2_000,
      owner: "@release-owner",
      rollbackPlan: "docs/runbooks/student-contract-rollback.md",
      sha256: HASH_B,
      ...overrides,
    };
  }

  it.each([
    [
      "ALTER TABLE students ALTER COLUMN score TYPE bigint",
      "alter-column-type",
    ],
    [
      "ALTER TABLE students ALTER COLUMN score SET DATA TYPE bigint",
      "alter-column-type",
    ],
    ["ALTER TABLE students ALTER COLUMN email SET NOT NULL", "set-not-null"],
    ["ALTER TABLE students ALTER COLUMN status DROP DEFAULT", "drop-default"],
    [
      "ALTER TABLE students RENAME COLUMN email TO primary_email",
      "rename-contract",
    ],
    ["ALTER TYPE mood RENAME VALUE 'sad' TO 'unhappy'", "rename-contract"],
    ["ALTER TABLE students SET SCHEMA archive", "move-schema"],
    ["ALTER TABLE students DISABLE ROW LEVEL SECURITY", "weaken-rls"],
    ["ALTER TABLE students NO FORCE ROW LEVEL SECURITY", "weaken-rls"],
    ["DROP POLICY tenant_policy ON public.students", "drop-rls-policy"],
    ["REVOKE SELECT ON students FROM school_runtime", "revoke-privilege"],
  ])("detects %s", (sql, expectedKind) => {
    expect(findBackwardIncompatibleSql(`${sql};`)).toContain(expectedKind);
  });

  it("allows an atomic policy replacement on the same table", () => {
    expect(
      findBackwardIncompatibleSql(`
        DROP POLICY IF EXISTS tenant_policy ON public.students;
        CREATE POLICY tenant_policy ON public.students USING (true);
      `),
    ).not.toContain("drop-rls-policy");
  });

  it("detects removing one named policy while adding a different policy", () => {
    expect(
      findBackwardIncompatibleSql(`
        DROP POLICY IF EXISTS students_delete_policy ON public.students;
        CREATE POLICY students_select_policy ON public.students FOR SELECT USING (true);
      `),
    ).toContain("drop-rls-policy");
  });

  it("parses only strict, auditable maintenance records", () => {
    expect(
      parseDestructiveMigrationMaintenanceRecords({
        version: 1,
        records: [maintenanceRecord()],
      }),
    ).toEqual([maintenanceRecord()]);
    expect(() =>
      parseDestructiveMigrationMaintenanceRecords({
        version: 1,
        records: [{ ...maintenanceRecord(), unexpected: true }],
      }),
    ).toThrow("must contain exactly");
    expect(() =>
      parseDestructiveMigrationMaintenanceRecords({
        version: 1,
        records: [
          maintenanceRecord({ evidenceUrl: "https://example.com/evidence" }),
        ],
      }),
    ).toThrow("https://github.com evidence URL");
  });

  it("rejects an unrecorded destructive migration even if it appears historical", () => {
    expect(() =>
      assertProductionDestructiveMigrationPolicy(
        [deploymentMigration()],
        [],
        1,
      ),
    ).toThrow("unrecorded destructive migration");
  });

  it("rejects a tampered maintenance hash", () => {
    expect(() =>
      assertProductionDestructiveMigrationPolicy(
        [deploymentMigration()],
        [maintenanceRecord({ sha256: HASH_C })],
        1,
      ),
    ).toThrow("does not exactly match");
  });

  it("rejects a recorded destructive migration that is still pending in production", () => {
    expect(() =>
      assertProductionDestructiveMigrationPolicy(
        [
          deploymentMigration({
            folderMillis: 1_000,
            hash: HASH_A,
            migrationPath: "apps/web/drizzle/0000_safe.sql",
            sql: SAFE_SQL,
          }),
          deploymentMigration(),
        ],
        [maintenanceRecord()],
        1,
      ),
    ).toThrow("will not auto-apply destructive migration");
  });

  it("accepts an exact destructive migration already present in the production ledger prefix", () => {
    expect(() =>
      assertProductionDestructiveMigrationPolicy(
        [
          deploymentMigration({
            folderMillis: 1_000,
            hash: HASH_A,
            migrationPath: "apps/web/drizzle/0000_safe.sql",
            sql: SAFE_SQL,
          }),
          deploymentMigration(),
        ],
        [maintenanceRecord()],
        2,
      ),
    ).not.toThrow();
  });

  it("rejects a maintenance record attached to a non-destructive migration", () => {
    expect(() =>
      assertProductionDestructiveMigrationPolicy(
        [deploymentMigration({ sql: SAFE_SQL })],
        [maintenanceRecord()],
        1,
      ),
    ).toThrow("does not identify a destructive migration");
  });
});

const TENANT_POLICIES = [
  "tenants_tenant_isolation_select",
  "tenants_tenant_isolation_insert",
  "tenants_tenant_isolation_update",
  "tenants_tenant_isolation_delete",
];
const COMPANY_POLICIES = [
  "companies_tenant_isolation_select",
  "companies_tenant_isolation_insert",
  "companies_tenant_isolation_update",
  "companies_tenant_isolation_delete",
];

function coveredTable(overrides: Partial<RlsCoverageRow>): RlsCoverageRow {
  return {
    table_name: "students",
    table_exists: true,
    has_tenant_id: true,
    row_security: true,
    force_row_security: true,
    policies: ["tenant_isolation_policy"],
    ...overrides,
  };
}

function completeRlsCoverage(): RlsCoverageRow[] {
  return [
    coveredTable({ table_name: "students" }),
    coveredTable({
      table_name: "tenants",
      has_tenant_id: false,
      policies: TENANT_POLICIES,
    }),
    coveredTable({
      table_name: "companies",
      has_tenant_id: false,
      policies: COMPANY_POLICIES,
    }),
  ];
}

describe("deployment migration RLS postflight", () => {
  it("accepts forced, enabled tenant RLS and the required special policies", () => {
    expect(() => assertRlsCoverage(completeRlsCoverage())).not.toThrow();
  });

  it("rejects a tenant table without forced RLS or a policy", () => {
    expect(() =>
      assertRlsCoverage([
        ...completeRlsCoverage().filter((row) => row.table_name !== "students"),
        coveredTable({ force_row_security: false }),
      ]),
    ).toThrow("enabled and forced");
    expect(() =>
      assertRlsCoverage([
        ...completeRlsCoverage().filter((row) => row.table_name !== "students"),
        coveredTable({ policies: [] }),
      ]),
    ).toThrow("has no RLS policy");
  });

  it("rejects missing tenant/company tables or required policies", () => {
    expect(() =>
      assertRlsCoverage(
        completeRlsCoverage().filter((row) => row.table_name !== "companies"),
      ),
    ).toThrow("public.companies");
    expect(() =>
      assertRlsCoverage(
        completeRlsCoverage().map((row) =>
          row.table_name === "tenants"
            ? { ...row, policies: TENANT_POLICIES.slice(1) }
            : row,
        ),
      ),
    ).toThrow("missing required RLS policies");
  });
});

describe("deployment migration advisory lock", () => {
  it("retries pg_try_advisory_lock with a bounded delay", async () => {
    const attempts = [false, false, true];
    const query = jest.fn(async () => ({
      rows: [{ acquired: attempts.shift() }],
    }));
    let now = 0;
    const sleep = jest.fn(async (milliseconds: number) => {
      now += milliseconds;
    });

    await acquireMigrationLock({ query } as never, {
      now: () => now,
      retryMs: 100,
      sleep,
      timeoutMs: 500,
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("times out instead of waiting forever", async () => {
    const query = jest.fn(async () => ({ rows: [{ acquired: false }] }));
    let now = 0;
    const sleep = jest.fn(async (milliseconds: number) => {
      now += milliseconds;
    });

    await expect(
      acquireMigrationLock({ query } as never, {
        now: () => now,
        retryMs: 100,
        sleep,
        timeoutMs: 250,
      }),
    ).rejects.toThrow("Timed out after 250ms");
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("unlocks the same session even when migration work fails", async () => {
    const migrationError = new Error("migration failed");
    const query = jest.fn(async (sql: string) => ({
      rows: sql.includes("pg_try_advisory_lock")
        ? [{ acquired: true }]
        : [{ released: true }],
    }));

    await expect(
      withMigrationLock({ query } as never, async () => {
        throw migrationError;
      }),
    ).rejects.toBe(migrationError);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("pg_advisory_unlock");
  });
});

describe("atomic migration, RLS, and runtime-grant boundary", () => {
  function atomicMigration(
    overrides: Partial<DeploymentMigration> = {},
  ): DeploymentMigration {
    const sql = "ALTER TABLE students ADD COLUMN preferred_name text;";
    return {
      folderMillis: 2_000,
      hash: HASH_B,
      migrationPath: "apps/web/drizzle/0001_add_preferred_name.sql",
      sql,
      statements: [sql],
      ...overrides,
    };
  }

  it("rejects top-level transaction control while allowing PL/pgSQL blocks and literals", () => {
    expect(() =>
      assertNoEmbeddedTransactionControl(
        "BEGIN; ALTER TABLE students ADD COLUMN unsafe text; COMMIT;",
        "test migration",
      ),
    ).toThrow("exclusively owns the atomic transaction boundary");
    expect(() =>
      assertNoEmbeddedTransactionControl(
        `
          DO $$
          BEGIN
            PERFORM 1;
          END $$;
          SELECT 'COMMIT; is data, not transaction control';
        `,
        "test migration",
      ),
    ).not.toThrow();
  });

  it("commits migration SQL, ledger, RLS, postflight, and grants as one transaction", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const query = jest.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return { rows: [] };
    });
    const alreadyApplied = atomicMigration({
      folderMillis: 1_000,
      hash: HASH_A,
      migrationPath: "apps/web/drizzle/0000_existing.sql",
      sql: "CREATE TABLE existing (id integer);",
      statements: ["CREATE TABLE existing (id integer);"],
    });
    const pending = atomicMigration();

    await applyDeploymentSchemaTransaction(
      { query } as never,
      [alreadyApplied, pending],
      1,
      "SET LOCAL app.bypass_rls = 'on'; ALTER TABLE students FORCE ROW LEVEL SECURITY;",
      async () => {
        await query("SELECT postflight_verification");
        await query("GRANT SELECT ON students TO school_runtime");
      },
    );

    const sql = calls.map((call) => call.sql);
    expect(sql.filter((statement) => statement === "BEGIN")).toHaveLength(1);
    expect(sql.filter((statement) => statement === "COMMIT")).toHaveLength(1);
    expect(sql).not.toContain("CREATE TABLE existing (id integer);");
    expect(sql.indexOf(pending.statements[0])).toBeGreaterThan(
      sql.indexOf("BEGIN"),
    );
    const ledgerIndex = sql.findIndex((statement) =>
      statement.startsWith("INSERT INTO drizzle.__drizzle_migrations"),
    );
    const rlsIndex = sql.findIndex((statement) =>
      statement.startsWith("SET LOCAL app.bypass_rls"),
    );
    const postflightIndex = sql.indexOf("SELECT postflight_verification");
    const grantIndex = sql.indexOf(
      "GRANT SELECT ON students TO school_runtime",
    );
    const commitIndex = sql.indexOf("COMMIT");
    expect(ledgerIndex).toBeGreaterThan(sql.indexOf(pending.statements[0]));
    expect(rlsIndex).toBeGreaterThan(ledgerIndex);
    expect(postflightIndex).toBeGreaterThan(rlsIndex);
    expect(grantIndex).toBeGreaterThan(postflightIndex);
    expect(commitIndex).toBeGreaterThan(grantIndex);
    expect(calls[ledgerIndex].values).toEqual([HASH_B, 2_000]);
  });

  it("rolls the schema and ledger back when RLS/postflight verification fails", async () => {
    const failure = new Error("RLS coverage failed");
    const sql: string[] = [];
    const query = jest.fn(async (statement: string) => {
      sql.push(statement.replace(/\s+/g, " ").trim());
      return { rows: [] };
    });

    await expect(
      applyDeploymentSchemaTransaction(
        { query } as never,
        [atomicMigration()],
        0,
        "ALTER TABLE students FORCE ROW LEVEL SECURITY;",
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
    expect(
      sql.findIndex((statement) =>
        statement.startsWith("INSERT INTO drizzle.__drizzle_migrations"),
      ),
    ).toBeGreaterThan(sql.indexOf(atomicMigration().statements[0]));
    expect(
      sql.findIndex((statement) =>
        statement.startsWith("ALTER TABLE students FORCE ROW LEVEL SECURITY"),
      ),
    ).toBeGreaterThan(
      sql.findIndex((statement) =>
        statement.startsWith("INSERT INTO drizzle.__drizzle_migrations"),
      ),
    );
  });

  it("preserves both errors if an atomic rollback also fails", async () => {
    const workError = new Error("postflight failed");
    const rollbackError = new Error("connection lost during rollback");
    const query = jest.fn(async (statement: string) => {
      if (statement === "ROLLBACK") throw rollbackError;
      return { rows: [] };
    });

    await expect(
      withDeploymentTransaction({ query } as never, async () => {
        throw workError;
      }),
    ).rejects.toMatchObject({
      errors: [workError, rollbackError],
      message: "Deployment transaction failed and rollback also failed.",
    });
  });
});
