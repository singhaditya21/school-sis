#!/usr/bin/env node

import { createHash } from "node:crypto";

import { Client } from "pg";

import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";
import { EXPECTED_DATABASE_MIGRATIONS } from "../src/generated/migration-manifest";

export const RECONCILIATION_DATABASE_URL_ENV =
  "MIGRATION_RECONCILIATION_DATABASE_URL";

type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

type QueryResult<Row> = { rows: Row[] };
export interface ReadOnlySqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

type CatalogRow = Record<string, JsonValue>;
type CatalogSectionName =
  | "columns"
  | "constraints"
  | "defaultPrivileges"
  | "extensions"
  | "functions"
  | "indexes"
  | "policies"
  | "relations"
  | "schemas"
  | "sequences"
  | "triggers"
  | "types"
  | "views";

type CatalogSection = {
  count: number;
  fingerprint: string;
  rows: CatalogRow[];
};

export type LedgerEvidence = {
  classification:
    | "absent"
    | "current-chain"
    | "current-prefix"
    | "divergent"
    | "empty";
  entries: Array<{ createdAt: string; hash: string }>;
  exists: boolean;
  fingerprint: string;
};

export type ReconciliationCatalogReport = {
  evidenceFingerprint: string;
  formatVersion: 2;
  invariants: {
    automaticMigrationPreflightAcceptable: boolean;
    currentMigrationCount: number;
    ledgerIsExactCurrentChain: boolean;
    ledgerIsExactCurrentPrefix: boolean;
    publicSchemaNonEmpty: boolean;
    readOnlySnapshot: true;
  };
  ledger: LedgerEvidence;
  reference: {
    currentMigrations: Array<{
      createdAt: string;
      hash: string;
      tag: string;
    }>;
  };
  schema: {
    fingerprint: string;
    sections: Record<CatalogSectionName, CatalogSection>;
  };
  transaction: {
    isolation: "repeatable read";
    readOnly: true;
  };
};

const NON_SYSTEM_SCHEMA_FILTER = String.raw`
  namespace.nspname <> 'information_schema'
  AND namespace.nspname <> 'drizzle'
  AND namespace.nspname !~ '^pg_(catalog|toast|temp|toas?temp_)'
`;

function normalizedAcl(aclExpression: string): string {
  return `(
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(acl_entry.grantor),
          'grantee', CASE
            WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl_entry.grantee)
          END,
          'privilege', acl_entry.privilege_type,
          'grantable', acl_entry.is_grantable
        )
        ORDER BY
          CASE
            WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl_entry.grantee)
          END,
          pg_catalog.pg_get_userbyid(acl_entry.grantor),
          acl_entry.privilege_type,
          acl_entry.is_grantable
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.aclexplode(${aclExpression}) acl_entry
  )`;
}

const CATALOG_QUERIES: Readonly<Record<CatalogSectionName, string>> =
  Object.freeze({
    schemas: `
    SELECT
      namespace.nspname AS "name",
      pg_catalog.pg_get_userbyid(namespace.nspowner) AS "owner",
      ${normalizedAcl(
        "COALESCE(namespace.nspacl, pg_catalog.acldefault('n'::\"char\", namespace.nspowner))",
      )} AS "acl"
    FROM pg_catalog.pg_namespace namespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
    ORDER BY namespace.nspname
  `,
    sequences: `
    SELECT
      sequence_value.schemaname AS "schema",
      sequence_value.sequencename AS "name",
      sequence_value.data_type AS "type",
      sequence_value.start_value::text AS "startValue",
      sequence_value.min_value::text AS "minValue",
      sequence_value.max_value::text AS "maxValue",
      sequence_value.increment_by::text AS "incrementBy",
      sequence_value.cycle AS "cycle",
      sequence_value.cache_size::text AS "cacheSize",
      pg_catalog.pg_get_userbyid(sequence_relation.relowner) AS "owner",
      ${normalizedAcl(
        "COALESCE(sequence_relation.relacl, pg_catalog.acldefault('s'::\"char\", sequence_relation.relowner))",
      )} AS "acl"
    FROM pg_catalog.pg_sequences sequence_value
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.nspname = sequence_value.schemaname
    JOIN pg_catalog.pg_class sequence_relation
      ON sequence_relation.relnamespace = namespace.oid
      AND sequence_relation.relname = sequence_value.sequencename
      AND sequence_relation.relkind = 'S'
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
    ORDER BY sequence_value.schemaname, sequence_value.sequencename
  `,
    defaultPrivileges: `
    SELECT
      pg_catalog.pg_get_userbyid(default_acl.defaclrole) AS "owner",
      CASE
        WHEN default_acl.defaclnamespace = 0 THEN NULL
        ELSE namespace.nspname
      END AS "schema",
      default_acl.defaclobjtype::text AS "objectType",
      ${normalizedAcl("default_acl.defaclacl")} AS "acl"
    FROM pg_catalog.pg_default_acl default_acl
    LEFT JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = default_acl.defaclnamespace
    WHERE default_acl.defaclnamespace = 0
      OR (${NON_SYSTEM_SCHEMA_FILTER})
    ORDER BY
      pg_catalog.pg_get_userbyid(default_acl.defaclrole),
      namespace.nspname NULLS FIRST,
      default_acl.defaclobjtype
  `,
    extensions: `
    SELECT
      extension.extname AS "name",
      namespace.nspname AS "schema",
      extension.extversion AS "version"
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = extension.extnamespace
    ORDER BY extension.extname, namespace.nspname, extension.extversion
  `,
    relations: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "name",
      relation.relkind::text AS "kind",
      relation.relpersistence::text AS "persistence",
      relation.relrowsecurity AS "rowSecurity",
      relation.relforcerowsecurity AS "forceRowSecurity",
      pg_catalog.pg_get_userbyid(relation.relowner) AS "owner",
      ${normalizedAcl(
        `COALESCE(
          relation.relacl,
          pg_catalog.acldefault(
            CASE WHEN relation.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END,
            relation.relowner
          )
        )`,
      )} AS "acl",
      CASE
        WHEN relation.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(relation.oid)
        ELSE NULL
      END AS "partitionKey"
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT (
        namespace.nspname = 'drizzle'
        AND relation.relname = '__drizzle_migrations'
      )
    ORDER BY namespace.nspname, relation.relname, relation.relkind
  `,
    columns: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "relation",
      attribute.attnum AS "position",
      attribute.attname AS "name",
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS "type",
      attribute.attnotnull AS "notNull",
      attribute.attidentity::text AS "identity",
      attribute.attgenerated::text AS "generated",
      CASE
        WHEN collation_value.oid IS NULL THEN NULL
        ELSE collation_namespace.nspname || '.' || collation_value.collname
      END AS "collation",
      pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, true) AS "default"
    FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    LEFT JOIN pg_catalog.pg_collation collation_value
      ON collation_value.oid = attribute.attcollation
    LEFT JOIN pg_catalog.pg_namespace collation_namespace
      ON collation_namespace.oid = collation_value.collnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND NOT (
        namespace.nspname = 'drizzle'
        AND relation.relname = '__drizzle_migrations'
      )
    ORDER BY namespace.nspname, relation.relname, attribute.attnum
  `,
    constraints: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "relation",
      constraint_value.conname AS "name",
      constraint_value.contype::text AS "type",
      constraint_value.condeferrable AS "deferrable",
      constraint_value.condeferred AS "initiallyDeferred",
      constraint_value.convalidated AS "validated",
      pg_catalog.pg_get_constraintdef(constraint_value.oid, true) AS "definition"
    FROM pg_catalog.pg_constraint constraint_value
    JOIN pg_catalog.pg_class relation ON relation.oid = constraint_value.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND NOT (
        namespace.nspname = 'drizzle'
        AND relation.relname = '__drizzle_migrations'
      )
    ORDER BY namespace.nspname, relation.relname, constraint_value.conname
  `,
    indexes: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "relation",
      index_relation.relname AS "name",
      index_value.indisprimary AS "primary",
      index_value.indisunique AS "unique",
      index_value.indisvalid AS "valid",
      index_value.indisready AS "ready",
      index_value.indislive AS "live",
      pg_catalog.pg_get_indexdef(index_value.indexrelid, 0, true) AS "definition"
    FROM pg_catalog.pg_index index_value
    JOIN pg_catalog.pg_class relation ON relation.oid = index_value.indrelid
    JOIN pg_catalog.pg_class index_relation ON index_relation.oid = index_value.indexrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND NOT (
        namespace.nspname = 'drizzle'
        AND relation.relname = '__drizzle_migrations'
      )
    ORDER BY namespace.nspname, relation.relname, index_relation.relname
  `,
    triggers: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "relation",
      trigger_value.tgname AS "name",
      trigger_value.tgenabled::text AS "enabled",
      pg_catalog.pg_get_triggerdef(trigger_value.oid, true) AS "definition"
    FROM pg_catalog.pg_trigger trigger_value
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger_value.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND NOT trigger_value.tgisinternal
      AND NOT (
        namespace.nspname = 'drizzle'
        AND relation.relname = '__drizzle_migrations'
      )
    ORDER BY namespace.nspname, relation.relname, trigger_value.tgname
  `,
    functions: `
    SELECT
      namespace.nspname AS "schema",
      procedure.proname AS "name",
      procedure.prokind::text AS "kind",
      language.lanname AS "language",
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS "arguments",
      pg_catalog.pg_get_function_result(procedure.oid) AS "result",
      procedure.prosecdef AS "securityDefiner",
      procedure.provolatile::text AS "volatility",
      procedure.proconfig AS "configuration",
      pg_catalog.pg_get_userbyid(procedure.proowner) AS "owner",
      ${normalizedAcl(
        "COALESCE(procedure.proacl, pg_catalog.acldefault('f'::\"char\", procedure.proowner))",
      )} AS "acl",
      pg_catalog.pg_get_functiondef(procedure.oid) AS "definition"
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND procedure.prokind IN ('f', 'p')
    ORDER BY
      namespace.nspname,
      procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)
  `,
    policies: `
    SELECT
      schemaname AS "schema",
      tablename AS "relation",
      policyname AS "name",
      permissive AS "permissive",
      roles AS "roles",
      cmd AS "command",
      qual AS "using",
      with_check AS "withCheck"
    FROM pg_catalog.pg_policies
    WHERE schemaname <> 'information_schema'
      AND schemaname <> 'drizzle'
      AND schemaname !~ '^pg_(catalog|toast|temp|toas?temp_)'
    ORDER BY schemaname, tablename, policyname
  `,
    types: `
    SELECT
      namespace.nspname AS "schema",
      type_value.typname AS "name",
      type_value.typtype::text AS "kind",
      CASE
        WHEN type_value.typtype = 'd'
          THEN pg_catalog.format_type(type_value.typbasetype, type_value.typtypmod)
        ELSE NULL
      END AS "baseType",
      type_value.typnotnull AS "notNull",
      type_value.typdefault AS "default",
      CASE
        WHEN type_value.typtype = 'd' THEN ARRAY(
          SELECT pg_catalog.pg_get_constraintdef(domain_constraint.oid, true)
          FROM pg_catalog.pg_constraint domain_constraint
          WHERE domain_constraint.contypid = type_value.oid
          ORDER BY domain_constraint.conname
        )
        ELSE NULL
      END AS "domainConstraints",
      CASE
        WHEN type_value.typtype = 'e' THEN ARRAY(
          SELECT enum_value.enumlabel
          FROM pg_catalog.pg_enum enum_value
          WHERE enum_value.enumtypid = type_value.oid
          ORDER BY enum_value.enumsortorder
        )
        ELSE NULL
      END AS "enumLabels"
    FROM pg_catalog.pg_type type_value
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = type_value.typnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND type_value.typtype IN ('d', 'e')
    ORDER BY namespace.nspname, type_value.typname
  `,
    views: `
    SELECT
      namespace.nspname AS "schema",
      relation.relname AS "name",
      relation.relkind::text AS "kind",
      pg_catalog.pg_get_viewdef(relation.oid, true) AS "definition"
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE ${NON_SYSTEM_SCHEMA_FILTER}
      AND relation.relkind IN ('v', 'm')
    ORDER BY namespace.nspname, relation.relname
  `,
  });

function asJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Catalog contains a non-finite number.");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, asJsonValue(nested)]),
    );
  }
  throw new Error(`Catalog contains unsupported value type ${typeof value}.`);
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(",")}}`;
}

function fingerprint(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function section(rows: Array<Record<string, unknown>>): CatalogSection {
  const normalized = rows.map((row) => asJsonValue(row) as CatalogRow);
  normalized.sort((left, right) => {
    const leftJson = canonicalJson(left);
    const rightJson = canonicalJson(right);
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
  return {
    count: normalized.length,
    fingerprint: fingerprint(normalized),
    rows: normalized,
  };
}

function expectedMigrations() {
  return EXPECTED_DATABASE_MIGRATIONS.map((migration) => ({
    createdAt: migration.createdAt,
    hash: migration.hash,
    tag: migration.tag,
  }));
}

export function buildReconciliationCatalogReport(input: {
  catalogRows: Record<
    Exclude<CatalogSectionName, "defaultPrivileges">,
    Array<Record<string, unknown>>
  > & {
    defaultPrivileges?: Array<Record<string, unknown>>;
  };
  ledgerEntries: Array<{ created_at: unknown; hash: unknown }>;
  ledgerExists: boolean;
}): ReconciliationCatalogReport {
  const sections = Object.fromEntries(
    (Object.keys(CATALOG_QUERIES) as CatalogSectionName[]).map((name) => {
      const rows = input.catalogRows[name];
      if (!rows && name !== "defaultPrivileges") {
        throw new Error(`Catalog rows are missing required section ${name}.`);
      }
      return [name, section(rows ?? [])];
    }),
  ) as Record<CatalogSectionName, CatalogSection>;
  const migrations = expectedMigrations();
  const entries = input.ledgerEntries
    .map((entry) => ({
      createdAt: String(entry.created_at),
      hash: typeof entry.hash === "string" ? entry.hash : "",
    }))
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return BigInt(left.createdAt) < BigInt(right.createdAt) ? -1 : 1;
      }
      return left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0;
    });
  const ledgerIsExactCurrentPrefix =
    entries.length <= migrations.length &&
    entries.every(
      (entry, index) =>
        entry.createdAt === migrations[index]?.createdAt &&
        entry.hash === migrations[index]?.hash,
    );
  const ledgerIsExactCurrentChain =
    ledgerIsExactCurrentPrefix && entries.length === migrations.length;
  const publicSchemaNonEmpty = sections.relations.rows.some(
    (row) => row.schema === "public",
  );
  const classification: LedgerEvidence["classification"] = !input.ledgerExists
    ? "absent"
    : entries.length === 0
      ? "empty"
      : ledgerIsExactCurrentChain
        ? "current-chain"
        : ledgerIsExactCurrentPrefix
          ? "current-prefix"
          : "divergent";
  const ledger: LedgerEvidence = {
    classification,
    entries,
    exists: input.ledgerExists,
    fingerprint: fingerprint({ entries, exists: input.ledgerExists }),
  };
  const schemaFingerprint = fingerprint(
    Object.fromEntries(
      Object.entries(sections).map(([name, value]) => [name, value.rows]),
    ),
  );
  const automaticMigrationPreflightAcceptable =
    ledgerIsExactCurrentPrefix &&
    !(!publicSchemaNonEmpty && entries.length > 0) &&
    !(publicSchemaNonEmpty && entries.length === 0);
  const reportWithoutEvidenceFingerprint = {
    formatVersion: 2 as const,
    invariants: {
      automaticMigrationPreflightAcceptable,
      currentMigrationCount: migrations.length,
      ledgerIsExactCurrentChain,
      ledgerIsExactCurrentPrefix,
      publicSchemaNonEmpty,
      readOnlySnapshot: true as const,
    },
    ledger,
    reference: { currentMigrations: migrations },
    schema: { fingerprint: schemaFingerprint, sections },
    transaction: {
      isolation: "repeatable read" as const,
      readOnly: true as const,
    },
  };
  return {
    ...reportWithoutEvidenceFingerprint,
    evidenceFingerprint: fingerprint(reportWithoutEvidenceFingerprint),
  };
}

export async function collectReconciliationCatalog(
  client: ReadOnlySqlClient,
): Promise<ReconciliationCatalogReport> {
  const catalogRows = {} as Record<
    CatalogSectionName,
    Array<Record<string, unknown>>
  >;
  for (const name of Object.keys(
    CATALOG_QUERIES,
  ).sort() as CatalogSectionName[]) {
    try {
      catalogRows[name] = (await client.query(CATALOG_QUERIES[name])).rows;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Catalog query ${name} failed: ${detail}`);
    }
  }

  const ledgerIdentity = await client.query<{ ledger_name: string | null }>(
    `SELECT pg_catalog.to_regclass('drizzle.__drizzle_migrations')::text AS ledger_name`,
  );
  const ledgerExists = ledgerIdentity.rows[0]?.ledger_name !== null;
  const ledgerEntries = ledgerExists
    ? (
        await client.query<{ created_at: unknown; hash: unknown }>(`
          SELECT created_at, hash
          FROM drizzle.__drizzle_migrations
          ORDER BY created_at, hash
        `)
      ).rows
    : [];

  return buildReconciliationCatalogReport({
    catalogRows,
    ledgerEntries,
    ledgerExists,
  });
}

export function resolveAuditConnection(environment: NodeJS.ProcessEnv): {
  connectionString: string;
  ssl: { rejectUnauthorized: boolean } | undefined;
} {
  const value = environment[RECONCILIATION_DATABASE_URL_ENV]?.trim();
  if (!value) {
    throw new Error(`${RECONCILIATION_DATABASE_URL_ENV} is required.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `${RECONCILIATION_DATABASE_URL_ENV} must be a valid PostgreSQL URL.`,
    );
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${RECONCILIATION_DATABASE_URL_ENV} must use PostgreSQL.`);
  }
  if (!parsed.hostname || !parsed.pathname.replace(/^\/+/, "")) {
    throw new Error(
      `${RECONCILIATION_DATABASE_URL_ENV} must include a host and database name.`,
    );
  }
  if (
    [...parsed.searchParams.keys()].some((key) => key.toLowerCase() === "host")
  ) {
    throw new Error(
      `${RECONCILIATION_DATABASE_URL_ENV} must not override host.`,
    );
  }
  return resolveDatabaseConnectionOptions(value, environment.DATABASE_SSL_MODE);
}

export async function runReconciliationCatalogAudit(
  environment: NodeJS.ProcessEnv = process.env,
  createClient: (options: ConstructorParameters<typeof Client>[0]) => Client = (
    options,
  ) => new Client(options),
): Promise<ReconciliationCatalogReport> {
  const connection = resolveAuditConnection(environment);
  const client = createClient({
    ...connection,
    application_name: "school-sis-migration-reconciliation-audit",
  });
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;
    const transaction = await client.query<{
      isolation: string;
      read_only: string;
    }>(`
      SELECT
        current_setting('transaction_isolation') AS isolation,
        current_setting('transaction_read_only') AS read_only
    `);
    if (
      transaction.rows[0]?.isolation !== "repeatable read" ||
      transaction.rows[0]?.read_only !== "on"
    ) {
      throw new Error(
        "Database did not establish a repeatable-read read-only transaction.",
      );
    }
    const report = await collectReconciliationCatalog(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return report;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original, sanitized failure below.
      }
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function redactAuditError(
  error: unknown,
  databaseUrl: string | undefined,
): string {
  let message = error instanceof Error ? error.message : String(error);
  if (!databaseUrl) return message;
  const sensitiveValues = new Set([databaseUrl]);
  try {
    const parsed = new URL(databaseUrl);
    for (const value of [
      parsed.password,
      decodeURIComponent(parsed.password),
      parsed.username,
      decodeURIComponent(parsed.username),
    ]) {
      if (value) sensitiveValues.add(value);
    }
  } catch {
    // The invalid raw URL is still redacted below.
  }
  for (const value of [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  )) {
    message = message.replaceAll(value, "[REDACTED]");
  }
  return message;
}
