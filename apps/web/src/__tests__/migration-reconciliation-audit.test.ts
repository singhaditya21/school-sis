import type { Client } from "pg";

import {
  buildReconciliationCatalogReport,
  canonicalJson,
  redactAuditError,
  resolveAuditConnection,
  runReconciliationCatalogAudit,
} from "../../scripts/audit-migration-reconciliation";
import { EXPECTED_DATABASE_MIGRATIONS } from "../generated/migration-manifest";

const CURRENT_LEDGER = EXPECTED_DATABASE_MIGRATIONS.map((migration) => ({
  created_at: migration.createdAt,
  hash: migration.hash,
}));

function catalogRows() {
  const ownerGrant = () => ({
    grantor: "migration_owner",
    grantee: "migration_owner",
    privilege: "ALL",
    grantable: true,
  });
  return {
    columns: [
      { schema: "public", relation: "tenants", position: 2, name: "name" },
      { name: "id", position: 1, relation: "tenants", schema: "public" },
    ],
    constraints: [],
    extensions: [{ name: "vector", schema: "public", version: "0.8.1" }],
    defaultPrivileges: [
      {
        owner: "migration_owner",
        schema: "public",
        objectType: "r",
        acl: [
          ownerGrant(),
          {
            grantor: "migration_owner",
            grantee: "runtime_role",
            privilege: "SELECT",
            grantable: false,
          },
        ],
      },
    ],
    functions: [
      {
        schema: "public",
        name: "current_tenant_id",
        arguments: "",
        owner: "migration_owner",
        acl: [ownerGrant()],
      },
    ],
    indexes: [
      {
        schema: "public",
        relation: "tenants",
        name: "tenants_pkey",
        primary: true,
        unique: true,
        valid: true,
        ready: true,
        live: true,
        definition:
          "CREATE UNIQUE INDEX tenants_pkey ON public.tenants USING btree (id)",
      },
    ],
    policies: [],
    relations: [
      {
        name: "tenants",
        schema: "public",
        kind: "r",
        owner: "migration_owner",
        acl: [ownerGrant()],
      },
    ],
    schemas: [
      { name: "public", owner: "migration_owner", acl: [ownerGrant()] },
    ],
    sequences: [
      {
        schema: "public",
        name: "tenants_id_seq",
        owner: "migration_owner",
        acl: [ownerGrant()],
      },
    ],
    triggers: [],
    types: [],
    views: [],
  };
}

describe("migration reconciliation catalog evidence", () => {
  it("produces stable schema fingerprints independent of row and key order", () => {
    const first = buildReconciliationCatalogReport({
      catalogRows: catalogRows(),
      ledgerEntries: CURRENT_LEDGER,
      ledgerExists: true,
    });
    const reordered = catalogRows();
    reordered.columns.reverse();
    const second = buildReconciliationCatalogReport({
      catalogRows: reordered,
      ledgerEntries: CURRENT_LEDGER,
      ledgerExists: true,
    });

    expect(first.schema.fingerprint).toBe(second.schema.fingerprint);
    expect(first.evidenceFingerprint).toBe(second.evidenceFingerprint);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.formatVersion).toBe(2);
    expect(first.ledger.classification).toBe("current-chain");
    expect(first.invariants.automaticMigrationPreflightAcceptable).toBe(true);
  });

  it("keeps structural and ledger evidence separate", () => {
    const current = buildReconciliationCatalogReport({
      catalogRows: catalogRows(),
      ledgerEntries: CURRENT_LEDGER,
      ledgerExists: true,
    });
    const historical = buildReconciliationCatalogReport({
      catalogRows: catalogRows(),
      ledgerEntries: [{ created_at: "1", hash: "a".repeat(64) }],
      ledgerExists: true,
    });

    expect(historical.schema.fingerprint).toBe(current.schema.fingerprint);
    expect(historical.ledger.fingerprint).not.toBe(current.ledger.fingerprint);
    expect(historical.evidenceFingerprint).not.toBe(
      current.evidenceFingerprint,
    );
    expect(historical.ledger.classification).toBe("divergent");
    expect(historical.invariants.automaticMigrationPreflightAcceptable).toBe(
      false,
    );
  });

  it.each(["ready", "live"] as const)(
    "fingerprints the pg_index %s state",
    (state) => {
      const healthyRows = catalogRows();
      const unhealthyRows = structuredClone(healthyRows);
      unhealthyRows.indexes[0][state] = false;

      const healthy = buildReconciliationCatalogReport({
        catalogRows: healthyRows,
        ledgerEntries: CURRENT_LEDGER,
        ledgerExists: true,
      });
      const unhealthy = buildReconciliationCatalogReport({
        catalogRows: unhealthyRows,
        ledgerEntries: CURRENT_LEDGER,
        ledgerExists: true,
      });

      expect(unhealthy.schema.sections.indexes.rows[0]?.[state]).toBe(false);
      expect(unhealthy.schema.sections.indexes.fingerprint).not.toBe(
        healthy.schema.sections.indexes.fingerprint,
      );
      expect(unhealthy.schema.fingerprint).not.toBe(healthy.schema.fingerprint);
      expect(unhealthy.evidenceFingerprint).not.toBe(
        healthy.evidenceFingerprint,
      );
    },
  );

  type CatalogRowsFixture = ReturnType<typeof catalogRows>;
  const securityMutations: Array<{
    label: string;
    section:
      | "defaultPrivileges"
      | "functions"
      | "relations"
      | "schemas"
      | "sequences";
    mutate: (rows: CatalogRowsFixture) => void;
  }> = [
    {
      label: "schema owner",
      section: "schemas",
      mutate: (rows) => {
        rows.schemas[0].owner = "unexpected_owner";
      },
    },
    {
      label: "schema ACL",
      section: "schemas",
      mutate: (rows) => {
        rows.schemas[0].acl[0].privilege = "CREATE";
      },
    },
    {
      label: "relation owner",
      section: "relations",
      mutate: (rows) => {
        rows.relations[0].owner = "unexpected_owner";
      },
    },
    {
      label: "relation ACL",
      section: "relations",
      mutate: (rows) => {
        rows.relations[0].acl[0].grantee = "PUBLIC";
      },
    },
    {
      label: "function owner",
      section: "functions",
      mutate: (rows) => {
        rows.functions[0].owner = "unexpected_owner";
      },
    },
    {
      label: "function ACL",
      section: "functions",
      mutate: (rows) => {
        rows.functions[0].acl[0].grantee = "PUBLIC";
      },
    },
    {
      label: "sequence owner",
      section: "sequences",
      mutate: (rows) => {
        rows.sequences[0].owner = "unexpected_owner";
      },
    },
    {
      label: "sequence ACL",
      section: "sequences",
      mutate: (rows) => {
        rows.sequences[0].acl[0].grantable = false;
      },
    },
    {
      label: "default ACL",
      section: "defaultPrivileges",
      mutate: (rows) => {
        rows.defaultPrivileges[0].acl[1].privilege = "UPDATE";
      },
    },
    {
      label: "default privilege owner",
      section: "defaultPrivileges",
      mutate: (rows) => {
        rows.defaultPrivileges[0].owner = "unexpected_owner";
      },
    },
  ];

  it.each(securityMutations)(
    "fingerprints a changed $label in $section",
    ({ section, mutate }) => {
      const healthyRows = catalogRows();
      const changedRows = structuredClone(healthyRows);
      mutate(changedRows);

      const healthy = buildReconciliationCatalogReport({
        catalogRows: healthyRows,
        ledgerEntries: CURRENT_LEDGER,
        ledgerExists: true,
      });
      const changed = buildReconciliationCatalogReport({
        catalogRows: changedRows,
        ledgerEntries: CURRENT_LEDGER,
        ledgerExists: true,
      });

      expect(changed.schema.sections[section].fingerprint).not.toBe(
        healthy.schema.sections[section].fingerprint,
      );
      expect(changed.schema.fingerprint).not.toBe(healthy.schema.fingerprint);
      expect(changed.evidenceFingerprint).not.toBe(healthy.evidenceFingerprint);
    },
  );

  it("requires a URL only through the dedicated environment variable", () => {
    expect(() => resolveAuditConnection({})).toThrow(
      "MIGRATION_RECONCILIATION_DATABASE_URL is required",
    );
    expect(() =>
      resolveAuditConnection({
        MIGRATION_RECONCILIATION_DATABASE_URL:
          "postgresql://user:secret@localhost/db?host=elsewhere",
        DATABASE_SSL_MODE: "disable",
      }),
    ).toThrow("must not override host");
    const resolved = resolveAuditConnection({
      MIGRATION_RECONCILIATION_DATABASE_URL:
        "postgresql://user:secret@localhost:5432/db?sslmode=disable",
      DATABASE_SSL_MODE: "disable",
    });
    expect(resolved.connectionString).not.toContain("sslmode");
  });

  it("redacts URLs, usernames, and passwords from failures", () => {
    const url = "postgresql://audit-user:sensitive-password@localhost:5432/db";
    const message = redactAuditError(
      new Error(`failed for ${url} as audit-user using sensitive-password`),
      url,
    );
    expect(message).not.toContain(url);
    expect(message).not.toContain("audit-user");
    expect(message).not.toContain("sensitive-password");
  });

  it("establishes and verifies repeatable-read read-only before catalog queries", async () => {
    class FakeClient {
      readonly queries: string[] = [];

      async connect() {}

      async end() {}

      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        this.queries.push(normalized);
        if (normalized.startsWith("SELECT current_setting")) {
          return { rows: [{ isolation: "repeatable read", read_only: "on" }] };
        }
        if (
          normalized.includes("to_regclass('drizzle.__drizzle_migrations')")
        ) {
          return { rows: [{ ledger_name: null }] };
        }
        if (normalized.includes("FROM pg_catalog.pg_index index_value")) {
          return {
            rows: [
              {
                schema: "public",
                relation: "tenants",
                name: "tenants_pkey",
                primary: true,
                unique: true,
                valid: true,
                ready: true,
                live: true,
                definition:
                  "CREATE UNIQUE INDEX tenants_pkey ON public.tenants USING btree (id)",
              },
            ],
          };
        }
        if (normalized.includes("FROM pg_catalog.pg_default_acl default_acl")) {
          return {
            rows: [
              {
                owner: "migration_owner",
                schema: "public",
                objectType: "r",
                acl: [
                  {
                    grantor: "migration_owner",
                    grantee: "runtime_role",
                    privilege: "SELECT",
                    grantable: false,
                  },
                ],
              },
            ],
          };
        }
        if (
          normalized.includes("FROM pg_catalog.pg_sequences sequence_value")
        ) {
          return {
            rows: [
              {
                schema: "public",
                name: "default_acl_sequence",
                type: "bigint",
                startValue: "1",
                minValue: "1",
                maxValue: "9223372036854775807",
                incrementBy: "1",
                cycle: false,
                cacheSize: "1",
                owner: "migration_owner",
                acl: [
                  {
                    grantor: "migration_owner",
                    grantee: "migration_owner",
                    privilege: "SELECT",
                    grantable: false,
                  },
                  {
                    grantor: "migration_owner",
                    grantee: "migration_owner",
                    privilege: "UPDATE",
                    grantable: false,
                  },
                  {
                    grantor: "migration_owner",
                    grantee: "migration_owner",
                    privilege: "USAGE",
                    grantable: false,
                  },
                ],
              },
            ],
          };
        }
        return { rows: [] };
      }
    }

    const fake = new FakeClient();
    const report = await runReconciliationCatalogAudit(
      {
        MIGRATION_RECONCILIATION_DATABASE_URL:
          "postgresql://audit-user:secret@localhost:5432/db",
        DATABASE_SSL_MODE: "disable",
      },
      () => fake as unknown as Client,
    );

    expect(fake.queries[0]).toBe(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(fake.queries.at(-1)).toBe("COMMIT");
    expect(
      fake.queries
        .slice(1, -1)
        .every((query) => query.toUpperCase().startsWith("SELECT")),
    ).toBe(true);
    expect(fake.queries.join(" ")).not.toMatch(
      /\b(?:ALTER|CREATE|DELETE|DROP|GRANT|INSERT|REVOKE|TRUNCATE|UPDATE)\b/i,
    );
    expect(report.transaction).toEqual({
      isolation: "repeatable read",
      readOnly: true,
    });
    const indexQuery = fake.queries.find((query) =>
      query.includes("FROM pg_catalog.pg_index index_value"),
    );
    expect(indexQuery).toContain('index_value.indisready AS "ready"');
    expect(indexQuery).toContain('index_value.indislive AS "live"');
    const securityQueries = [
      fake.queries.find((query) =>
        query.includes("FROM pg_catalog.pg_namespace namespace"),
      ),
      fake.queries.find((query) =>
        query.includes("FROM pg_catalog.pg_class relation"),
      ),
      fake.queries.find((query) =>
        query.includes("FROM pg_catalog.pg_proc procedure"),
      ),
      fake.queries.find((query) =>
        query.includes("FROM pg_catalog.pg_sequences sequence_value"),
      ),
      fake.queries.find((query) =>
        query.includes("FROM pg_catalog.pg_default_acl default_acl"),
      ),
    ];
    for (const query of securityQueries) {
      expect(query).toContain('AS "owner"');
      expect(query).toContain("pg_catalog.aclexplode");
    }
    const sequenceQuery = securityQueries[3];
    expect(sequenceQuery).toContain(
      "pg_catalog.acldefault('s'::\"char\", sequence_relation.relowner)",
    );
    const relationsQuery = securityQueries[1];
    expect(relationsQuery).toContain(
      "CASE WHEN relation.relkind = 'S' THEN 's'::\"char\" ELSE 'r'::\"char\" END",
    );
    expect(report.ledger.classification).toBe("absent");
    expect(report.schema.sections.indexes.rows).toEqual([
      expect.objectContaining({ ready: true, live: true }),
    ]);
    expect(report.schema.sections.defaultPrivileges.rows).toEqual([
      expect.objectContaining({
        owner: "migration_owner",
        schema: "public",
        objectType: "r",
      }),
    ]);
    expect(report.schema.sections.sequences.rows).toEqual([
      expect.objectContaining({
        name: "default_acl_sequence",
        owner: "migration_owner",
        acl: expect.arrayContaining([
          expect.objectContaining({
            grantee: "migration_owner",
            privilege: "USAGE",
          }),
        ]),
      }),
    ]);
  });
});
