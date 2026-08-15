import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";
import { Client, type QueryResultRow } from "pg";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import {
  resolveDatabaseConnectionOptions,
  type DatabaseSslMode,
} from "../../../packages/api/src/db/ssl";

export const DEPLOYMENT_TARGETS = ["ci", "preview", "production"] as const;
export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[number];

export const DEPLOYMENT_MIGRATION_LOCK_NAME =
  "school-sis:deployment-migrations:v1";
export const DEPLOYMENT_RUNTIME_ROLE_ENV = "DEPLOYMENT_RUNTIME_ROLE";
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 60_000;
export const DEFAULT_MIGRATION_LOCK_RETRY_MS = 1_000;

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MAINTENANCE_RECORD_PATH =
  "scripts/destructive-migration-maintenance.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_POSTGRES_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MAINTENANCE_OWNER_PATTERN = /^[A-Za-z0-9_.@/-]{2,100}$/;
const MIGRATION_PATH_PATTERN = /^apps\/web\/drizzle\/[A-Za-z0-9_-]+\.sql$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REQUIRED_SPECIAL_POLICIES: Readonly<Record<string, readonly string[]>> = {
  tenants: [
    "tenants_tenant_isolation_select",
    "tenants_tenant_isolation_insert",
    "tenants_tenant_isolation_update",
    "tenants_tenant_isolation_delete",
  ],
  companies: [
    "companies_tenant_isolation_select",
    "companies_tenant_isolation_insert",
    "companies_tenant_isolation_update",
    "companies_tenant_isolation_delete",
  ],
};

export interface DeploymentEnvironment {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  DATABASE_SSL_MODE?: string;
  DEPLOYMENT_RUNTIME_ROLE?: string;
}

export interface DeploymentConnection {
  connectionString: string;
  hostname: string;
  source: "DATABASE_URL" | "DIRECT_URL" | "DATABASE_URL_UNPOOLED";
  sslMode: DatabaseSslMode;
}

export interface ExpectedMigration {
  folderMillis: number;
  hash: string;
}

export interface DeploymentMigration extends ExpectedMigration {
  migrationPath: string;
  sql: string;
  statements: readonly string[];
}

export interface DestructiveMigrationMaintenanceRecord {
  evidenceUrl: string;
  migrationPath: string;
  migrationTimestamp: number;
  owner: string;
  rollbackPlan: string;
  sha256: string;
}

export interface MigrationLedgerRow {
  created_at: unknown;
  hash: unknown;
}

export interface MigrationDatabaseState {
  ledgerExists: boolean;
  ledgerRows: MigrationLedgerRow[];
  publicSchemaNonEmpty: boolean;
}

export interface RlsCoverageRow {
  table_name: string;
  table_exists: boolean;
  has_tenant_id: boolean;
  row_security: boolean;
  force_row_security: boolean;
  policies: string[];
}

export interface DeploymentRuntimeRoleAttributes {
  role_name: string;
  migration_owner: string;
  can_login: boolean;
  is_superuser: boolean;
  bypass_rls: boolean;
  create_role: boolean;
  create_db: boolean;
  replication: boolean;
  has_role_memberships: boolean;
  owns_current_database: boolean;
  owns_public_schema: boolean;
  owns_drizzle_schema: boolean;
  owns_app_private_schema: boolean;
  owns_public_or_drizzle_relations: boolean;
  owns_public_or_drizzle_functions: boolean;
  owns_app_private_functions: boolean;
  can_create_in_public_schema: boolean;
  can_create_in_drizzle_schema: boolean;
  can_create_in_app_private_schema: boolean;
}

export interface DeploymentRuntimeRolePrivileges {
  public_schema_usage: boolean;
  drizzle_schema_usage: boolean;
  app_private_schema_usage: boolean;
  public_tables_dml: boolean;
  public_sequences_usage: boolean;
  migration_ledger_select: boolean;
  public_tables_only_dml: boolean;
  migration_ledger_only_select: boolean;
  required_app_private_function_execute: boolean;
  only_required_app_private_function_execute: boolean;
  default_table_privileges: boolean;
  default_table_privileges_only_dml: boolean;
  default_sequence_privileges: boolean;
  default_app_private_functions_restricted: boolean;
}

export interface MigrationRunResult {
  appliedBefore: number;
  migrationCount: number;
  target: DeploymentTarget;
}

export interface SqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

interface LockOptions {
  lockName?: string;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface DeploymentPaths {
  maintenanceRecord: string;
  migrationsFolder: string;
  tenantRlsSql: string;
}

interface RunDeploymentMigrationsOptions {
  cwd?: string;
  environment?: DeploymentEnvironment;
  lockRetryMs?: number;
  lockTimeoutMs?: number;
  logger?: Pick<Console, "info">;
  target: DeploymentTarget;
}

function isDeploymentTarget(value: string): value is DeploymentTarget {
  return DEPLOYMENT_TARGETS.includes(value as DeploymentTarget);
}

export function parseDeploymentTarget(
  arguments_: readonly string[],
): DeploymentTarget {
  const values: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") continue;

    if (argument === "--target") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--target requires ci, preview, or production.");
      }
      values.push(value);
      index += 1;
      continue;
    }

    if (argument.startsWith("--target=")) {
      values.push(argument.slice("--target=".length));
      continue;
    }

    if (arguments_.length === 1 && isDeploymentTarget(argument)) {
      values.push(argument);
      continue;
    }

    throw new Error(`Unknown deployment migration argument: ${argument}`);
  }

  if (values.length !== 1 || !isDeploymentTarget(values[0])) {
    throw new Error(
      "Exactly one --target=ci|preview|production argument is required.",
    );
  }

  return values[0];
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveDeploymentRuntimeRole(
  target: DeploymentTarget,
  environment: DeploymentEnvironment,
): string | undefined {
  const runtimeRole = nonBlank(environment.DEPLOYMENT_RUNTIME_ROLE);
  if (!runtimeRole) {
    if (target === "ci") return undefined;
    throw new Error(
      `${target} deployment migrations require ${DEPLOYMENT_RUNTIME_ROLE_ENV}.`,
    );
  }
  if (!SAFE_POSTGRES_IDENTIFIER_PATTERN.test(runtimeRole)) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must be a lowercase PostgreSQL identifier containing only letters, digits, and underscores, beginning with a letter or underscore, with at most 63 characters.`,
    );
  }
  return runtimeRole;
}

function assertNoConnectionIdentityOverrides(url: URL, source: string): void {
  const forbidden = new Set([
    "host",
    "port",
    "user",
    "password",
    "database",
    "db",
    "options",
  ]);
  const overrides = [...url.searchParams.keys()]
    .map((key) => key.toLowerCase())
    .filter((key) => forbidden.has(key));
  if (overrides.length > 0) {
    throw new Error(
      `${source} must encode connection identity in the URL authority and path; forbidden query override(s): ${[...new Set(overrides)].join(", ")}.`,
    );
  }
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

function isNeonHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "neon.tech" || normalized.endsWith(".neon.tech");
}

function isPooledNeonHostname(hostname: string): boolean {
  return hostname.toLowerCase().split(".")[0].endsWith("-pooler");
}

function parseConfiguredSslMode(
  value: string | undefined,
): DatabaseSslMode | undefined {
  if (!value) return undefined;
  if (value === "disable" || value === "require" || value === "verify-full")
    return value;
  throw new Error(
    "DATABASE_SSL_MODE must be one of: disable, require, verify-full.",
  );
}

function assertNoRemoteSslDowngrade(
  url: URL,
  configuredMode: DatabaseSslMode | undefined,
): void {
  if (configuredMode && configuredMode !== "verify-full") {
    throw new Error(
      "Remote deployment migrations require DATABASE_SSL_MODE=verify-full.",
    );
  }

  const sslModes: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "sslmode") sslModes.push(value.toLowerCase());
    if (normalizedKey === "ssl") {
      throw new Error(
        "Remote deployment URLs must use sslmode=verify-full, not the ssl query parameter.",
      );
    }
  }

  if (sslModes.length > 1 || sslModes.some((mode) => mode !== "verify-full")) {
    throw new Error(
      "Remote deployment URLs may only specify sslmode=verify-full.",
    );
  }
}

export function resolveDeploymentConnection(
  target: DeploymentTarget,
  environment: DeploymentEnvironment,
): DeploymentConnection {
  const candidates: Array<DeploymentConnection["source"]> =
    target === "ci"
      ? ["DIRECT_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL"]
      : ["DIRECT_URL", "DATABASE_URL_UNPOOLED"];
  const source = candidates.find((name) => nonBlank(environment[name]));

  if (!source) {
    const expected =
      target === "ci"
        ? "DIRECT_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL"
        : "DIRECT_URL or DATABASE_URL_UNPOOLED";
    throw new Error(`${target} deployment migrations require ${expected}.`);
  }

  const connectionString = nonBlank(environment[source])!;
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`${source} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${source} must use postgres:// or postgresql://.`);
  }

  assertNoConnectionIdentityOverrides(parsed, source);
  const hostname = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!hostname || !database) {
    throw new Error(`${source} must include a host and database name.`);
  }

  if (isPooledNeonHostname(hostname)) {
    throw new Error(
      `${source} is a pooled Neon URL; deployment migrations require a direct URL.`,
    );
  }

  const local = isLocalHostname(hostname);
  if (target !== "ci" && local) {
    throw new Error(
      `${target} deployment migrations cannot target a local database.`,
    );
  }
  if (!local && !isNeonHostname(hostname)) {
    throw new Error(
      `${target} deployment migrations require a direct Neon hostname.`,
    );
  }

  const configuredMode = parseConfiguredSslMode(environment.DATABASE_SSL_MODE);
  if (!local) assertNoRemoteSslDowngrade(parsed, configuredMode);

  return {
    connectionString,
    hostname,
    source,
    sslMode: configuredMode ?? (local ? "disable" : "verify-full"),
  };
}

export function normalizeExpectedMigrations(
  migrations: readonly Pick<MigrationMeta, "folderMillis" | "hash">[],
): ExpectedMigration[] {
  if (migrations.length === 0) {
    throw new Error("No deployment migration files were found.");
  }

  const timestamps = new Set<number>();
  const hashes = new Set<string>();
  let previousTimestamp = -1;

  return migrations.map((migration) => {
    const timestamp = migration.folderMillis;
    const hash = migration.hash;

    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
      throw new Error(`Invalid migration timestamp: ${String(timestamp)}.`);
    }
    if (timestamp <= previousTimestamp) {
      throw new Error(
        "Migration timestamps must be unique and strictly increasing in journal order.",
      );
    }
    if (timestamps.has(timestamp)) {
      throw new Error(`Duplicate migration timestamp: ${timestamp}.`);
    }
    if (!SHA256_PATTERN.test(hash)) {
      throw new Error(
        `Migration ${timestamp} does not have a lowercase SHA-256 hash.`,
      );
    }
    if (hashes.has(hash)) {
      throw new Error(`Duplicate migration hash for timestamp ${timestamp}.`);
    }

    timestamps.add(timestamp);
    hashes.add(hash);
    previousTimestamp = timestamp;
    return { folderMillis: timestamp, hash };
  });
}

const BACKWARD_INCOMPATIBLE_SQL_PATTERNS: ReadonlyArray<{
  kind: string;
  pattern: RegExp;
}> = [
  {
    kind: "drop-object",
    pattern:
      /\bDROP\s+(?:TABLE|TYPE|SCHEMA|DATABASE|MATERIALIZED\s+VIEW|VIEW|INDEX|FUNCTION|PROCEDURE|SEQUENCE|EXTENSION|TRIGGER|RULE|ROLE|OWNED|DOMAIN|COLLATION|PUBLICATION|SUBSCRIPTION)\b/giu,
  },
  { kind: "truncate", pattern: /\bTRUNCATE(?:\s+TABLE)?\b/giu },
  { kind: "delete-data", pattern: /\bDELETE\s+FROM\b/giu },
  { kind: "revoke-privilege", pattern: /\bREVOKE\b/giu },
  {
    kind: "drop-column-or-constraint",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\bDROP\s+(?:COLUMN|CONSTRAINT)\b/giu,
  },
  {
    kind: "alter-column-type",
    pattern:
      /\bALTER\s+TABLE\b[^;]*?\bALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+(?:SET\s+DATA\s+TYPE|TYPE)\b/giu,
  },
  {
    kind: "set-not-null",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\b(?:ALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+)?SET\s+NOT\s+NULL\b/giu,
  },
  {
    kind: "drop-default",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\b(?:ALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+)?DROP\s+DEFAULT\b/giu,
  },
  {
    kind: "rename-contract",
    pattern:
      /\bALTER\s+(?:TABLE|TYPE|DOMAIN|INDEX|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|SCHEMA|FUNCTION|PROCEDURE)\b[^;]*?\bRENAME\s+(?:COLUMN\s+|CONSTRAINT\s+|ATTRIBUTE\s+|VALUE\s+)?(?:"[^"]+"|'(?:''|[^'])*'|[a-z_][a-z0-9_$]*)?\s*TO\b/giu,
  },
  {
    kind: "move-schema",
    pattern:
      /\bALTER\s+(?:TABLE|TYPE|DOMAIN|INDEX|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|FUNCTION|PROCEDURE|COLLATION)\b[^;]*?\bSET\s+SCHEMA\b/giu,
  },
  {
    kind: "weaken-rls",
    pattern:
      /\bALTER\s+TABLE\b[^;]*?\b(?:DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY)\b/giu,
  },
  {
    kind: "disable-trigger",
    pattern: /\bALTER\s+TABLE\b[^;]*?\bDISABLE\s+TRIGGER\b/giu,
  },
  {
    kind: "detach-partition",
    pattern: /\bALTER\s+TABLE\b[^;]*?\bDETACH\s+PARTITION\b/giu,
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactObjectKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
  }
}

function assertMaintenanceText(
  value: unknown,
  label: string,
  maximumLength: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new Error(`${label} must be a non-empty single-line string.`);
  }
}

export function parseDestructiveMigrationMaintenanceRecords(
  value: unknown,
): DestructiveMigrationMaintenanceRecord[] {
  if (!isPlainObject(value)) {
    throw new Error(
      "Destructive-migration maintenance record must be a JSON object.",
    );
  }
  assertExactObjectKeys(
    value,
    ["records", "version"],
    "Destructive-migration maintenance record",
  );
  if (value.version !== 1) {
    throw new Error(
      "Destructive-migration maintenance record version must be 1.",
    );
  }
  if (!Array.isArray(value.records)) {
    throw new Error(
      "Destructive-migration maintenance records must be an array.",
    );
  }

  const timestamps = new Set<number>();
  const paths = new Set<string>();
  return value.records.map((rawRecord, index) => {
    const label = `Maintenance record ${index}`;
    if (!isPlainObject(rawRecord)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    assertExactObjectKeys(
      rawRecord,
      [
        "evidenceUrl",
        "migrationPath",
        "migrationTimestamp",
        "owner",
        "rollbackPlan",
        "sha256",
      ],
      label,
    );
    if (
      !Number.isSafeInteger(rawRecord.migrationTimestamp) ||
      (rawRecord.migrationTimestamp as number) <= 0
    ) {
      throw new Error(
        `${label} migrationTimestamp must be a positive integer.`,
      );
    }
    if (
      typeof rawRecord.migrationPath !== "string" ||
      !MIGRATION_PATH_PATTERN.test(rawRecord.migrationPath)
    ) {
      throw new Error(
        `${label} migrationPath must name one apps/web/drizzle SQL file.`,
      );
    }
    if (
      typeof rawRecord.sha256 !== "string" ||
      !SHA256_PATTERN.test(rawRecord.sha256)
    ) {
      throw new Error(`${label} sha256 must be a lowercase SHA-256 digest.`);
    }
    if (
      typeof rawRecord.owner !== "string" ||
      !MAINTENANCE_OWNER_PATTERN.test(rawRecord.owner)
    ) {
      throw new Error(`${label} owner has an invalid format.`);
    }
    assertMaintenanceText(rawRecord.rollbackPlan, `${label} rollbackPlan`, 500);
    assertMaintenanceText(rawRecord.evidenceUrl, `${label} evidenceUrl`, 500);
    let evidenceUrl: URL;
    try {
      evidenceUrl = new URL(rawRecord.evidenceUrl);
    } catch {
      throw new Error(`${label} evidenceUrl must be a valid URL.`);
    }
    if (
      evidenceUrl.protocol !== "https:" ||
      evidenceUrl.hostname !== "github.com"
    ) {
      throw new Error(
        `${label} evidenceUrl must be an https://github.com evidence URL.`,
      );
    }

    const migrationTimestamp = rawRecord.migrationTimestamp as number;
    if (timestamps.has(migrationTimestamp)) {
      throw new Error(
        `Duplicate maintenance migrationTimestamp ${migrationTimestamp}.`,
      );
    }
    if (paths.has(rawRecord.migrationPath)) {
      throw new Error(
        `Duplicate maintenance migrationPath ${rawRecord.migrationPath}.`,
      );
    }
    timestamps.add(migrationTimestamp);
    paths.add(rawRecord.migrationPath);
    return {
      evidenceUrl: rawRecord.evidenceUrl,
      migrationPath: rawRecord.migrationPath,
      migrationTimestamp,
      owner: rawRecord.owner,
      rollbackPlan: rawRecord.rollbackPlan,
      sha256: rawRecord.sha256,
    };
  });
}

function maskSqlComments(source: string): string {
  const characters = [...source];
  let state: "block" | "double" | "line" | "single" | "sql" = "sql";
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    const next = characters[index + 1];
    if (state === "line") {
      if (current === "\n" || current === "\r") state = "sql";
      else characters[index] = " ";
      continue;
    }
    if (state === "block") {
      if (current === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "sql";
      } else if (current !== "\n" && current !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (state === "single") {
      if (current === "'" && next === "'") index += 1;
      else if (current === "'") state = "sql";
      continue;
    }
    if (state === "double") {
      if (current === '"' && next === '"') index += 1;
      else if (current === '"') state = "sql";
      continue;
    }
    if (current === "-" && next === "-") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      state = "line";
    } else if (current === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      state = "block";
    } else if (current === "'") state = "single";
    else if (current === '"') state = "double";
  }
  return characters.join("");
}

function policyOperations(
  source: string,
  operation: "CREATE" | "DROP",
): Array<{ key: string; policyName: string; tableKey: string }> {
  const identifier = String.raw`(?:"(?:[^"]|"")*"|%I|[a-z_][a-z0-9_$]*)`;
  const pattern = new RegExp(
    String.raw`\b${operation}\s+POLICY(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+(${identifier})\s+ON\s+(${identifier})(?:\s*\.\s*(${identifier}))?`,
    "giu",
  );
  return [...source.matchAll(pattern)].map((match) => {
    const normalized = match
      .slice(1, 4)
      .filter((part): part is string => Boolean(part))
      .map((part) => part.replaceAll('"', "").toLowerCase());
    return {
      key: normalized.join("|"),
      policyName: normalized[0],
      tableKey: normalized.slice(1).join("|"),
    };
  });
}

export function findBackwardIncompatibleSql(source: string): string[] {
  const searchable = maskSqlComments(source);
  const findings: string[] = [];
  for (const { kind, pattern } of BACKWARD_INCOMPATIBLE_SQL_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(searchable)) findings.push(kind);
  }

  const createdPolicies = policyOperations(searchable, "CREATE");
  const createdPolicyKeys = new Set(createdPolicies.map(({ key }) => key));
  const tablesWithCreatedPolicies = new Set(
    createdPolicies.map(({ tableKey }) => tableKey),
  );
  const removesPolicy = policyOperations(searchable, "DROP").some(
    ({ key, policyName, tableKey }) =>
      !createdPolicyKeys.has(key) &&
      !(
        policyName === "tenant_isolation_policy" &&
        tablesWithCreatedPolicies.has(tableKey)
      ),
  );
  if (removesPolicy) findings.push("drop-rls-policy");
  return findings;
}

function maskSqlCommentsAndLiterals(source: string): string {
  const characters = [...source];
  let state:
    | { kind: "block" | "double" | "line" | "single" | "sql" }
    | { delimiter: string; kind: "dollar" } = { kind: "sql" };

  const mask = (index: number): void => {
    if (characters[index] !== "\n" && characters[index] !== "\r") {
      characters[index] = " ";
    }
  };

  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    const next = characters[index + 1];
    if (state.kind === "line") {
      if (current === "\n" || current === "\r") state = { kind: "sql" };
      else mask(index);
      continue;
    }
    if (state.kind === "block") {
      mask(index);
      if (current === "*" && next === "/") {
        mask(index + 1);
        index += 1;
        state = { kind: "sql" };
      }
      continue;
    }
    if (state.kind === "single" || state.kind === "double") {
      const quote = state.kind === "single" ? "'" : '"';
      mask(index);
      if (current === quote && next === quote) {
        mask(index + 1);
        index += 1;
      } else if (current === quote) {
        state = { kind: "sql" };
      }
      continue;
    }
    if (state.kind === "dollar") {
      if (source.startsWith(state.delimiter, index)) {
        for (let offset = 0; offset < state.delimiter.length; offset += 1) {
          mask(index + offset);
        }
        index += state.delimiter.length - 1;
        state = { kind: "sql" };
      } else {
        mask(index);
      }
      continue;
    }

    if (current === "-" && next === "-") {
      mask(index);
      mask(index + 1);
      index += 1;
      state = { kind: "line" };
    } else if (current === "/" && next === "*") {
      mask(index);
      mask(index + 1);
      index += 1;
      state = { kind: "block" };
    } else if (current === "'") {
      mask(index);
      state = { kind: "single" };
    } else if (current === '"') {
      mask(index);
      state = { kind: "double" };
    } else if (current === "$") {
      const delimiter = source
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0];
      if (delimiter) {
        for (let offset = 0; offset < delimiter.length; offset += 1) {
          mask(index + offset);
        }
        index += delimiter.length - 1;
        state = { delimiter, kind: "dollar" };
      }
    }
  }
  return characters.join("");
}

export function assertNoEmbeddedTransactionControl(
  source: string,
  label: string,
): void {
  const transactionControlPattern =
    /^(?:ABORT|BEGIN|COMMIT|END(?:\s+(?:WORK|TRANSACTION))?|PREPARE\s+TRANSACTION|RELEASE\s+SAVEPOINT|ROLLBACK|SAVEPOINT|SET\s+TRANSACTION|START\s+TRANSACTION)\b/iu;
  const statements = maskSqlCommentsAndLiterals(source).split(";");
  const control = statements
    .map((statement) => statement.replace(/\s+/gu, " ").trim())
    .find((statement) => transactionControlPattern.test(statement));
  if (control) {
    throw new Error(
      `${label} contains transaction control (${control.slice(0, 80)}); the deployment runner exclusively owns the atomic transaction boundary.`,
    );
  }
}

export function assertProductionDestructiveMigrationPolicy(
  migrations: readonly DeploymentMigration[],
  maintenanceRecords: readonly DestructiveMigrationMaintenanceRecord[],
  appliedBefore: number,
): void {
  if (
    !Number.isSafeInteger(appliedBefore) ||
    appliedBefore < 0 ||
    appliedBefore > migrations.length
  ) {
    throw new Error("Production migration prefix length is invalid.");
  }

  const migrationsByTimestamp = new Map(
    migrations.map((migration, index) => [
      migration.folderMillis,
      { index, migration },
    ]),
  );
  const recordsByTimestamp = new Map<
    number,
    DestructiveMigrationMaintenanceRecord
  >();
  for (const record of maintenanceRecords) {
    const matched = migrationsByTimestamp.get(record.migrationTimestamp);
    if (
      !matched ||
      matched.migration.migrationPath !== record.migrationPath ||
      matched.migration.hash !== record.sha256
    ) {
      throw new Error(
        `Maintenance record ${record.migrationPath} does not exactly match the immutable local migration path, timestamp, and SHA-256.`,
      );
    }
    if (findBackwardIncompatibleSql(matched.migration.sql).length === 0) {
      throw new Error(
        `Maintenance record ${record.migrationPath} does not identify a destructive migration.`,
      );
    }
    recordsByTimestamp.set(record.migrationTimestamp, record);
  }

  migrations.forEach((migration, index) => {
    const findings = findBackwardIncompatibleSql(migration.sql);
    if (findings.length === 0) return;
    const record = recordsByTimestamp.get(migration.folderMillis);
    if (!record) {
      throw new Error(
        `Production refuses unrecorded destructive migration ${migration.migrationPath} (${findings.join(", ")}).`,
      );
    }
    if (index >= appliedBefore) {
      throw new Error(
        `Production will not auto-apply destructive migration ${migration.migrationPath}; apply it in a reviewed maintenance operation before deployment and retain its exact ledger entry.`,
      );
    }
  });
}

function normalizeLedgerTimestamp(value: unknown): number {
  const text = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid migration ledger timestamp: ${text}.`);
  }
  const timestamp = Number(text);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error(`Invalid migration ledger timestamp: ${text}.`);
  }
  return timestamp;
}

export function assertMigrationLedger(
  expectedMigrations: readonly ExpectedMigration[],
  state: MigrationDatabaseState,
  phase: "preflight" | "postflight",
): number {
  if (!state.ledgerExists && state.ledgerRows.length > 0) {
    throw new Error(
      "Migration ledger rows were returned even though the ledger table is absent.",
    );
  }

  if (
    phase === "preflight" &&
    state.publicSchemaNonEmpty &&
    state.ledgerRows.length === 0
  ) {
    throw new Error(
      "Refusing to adopt a non-empty public schema with an absent or empty migration ledger.",
    );
  }

  if (state.ledgerRows.length > 0 && !state.publicSchemaNonEmpty) {
    throw new Error(
      "Migration ledger is populated but the public schema has no relations.",
    );
  }

  const expectedByTimestamp = new Map(
    expectedMigrations.map((migration) => [migration.folderMillis, migration]),
  );
  const seenTimestamps = new Set<number>();
  const seenHashes = new Set<string>();
  const normalizedRows = state.ledgerRows.map((row) => {
    const timestamp = normalizeLedgerTimestamp(row.created_at);
    const hash = typeof row.hash === "string" ? row.hash : "";

    if (seenTimestamps.has(timestamp)) {
      throw new Error(`Duplicate migration ledger timestamp: ${timestamp}.`);
    }
    if (seenHashes.has(hash)) {
      throw new Error(
        `Duplicate migration ledger hash at timestamp ${timestamp}.`,
      );
    }
    seenTimestamps.add(timestamp);
    seenHashes.add(hash);

    const expected = expectedByTimestamp.get(timestamp);
    if (!expected) {
      throw new Error(`Unknown migration ledger timestamp: ${timestamp}.`);
    }
    if (hash !== expected.hash) {
      throw new Error(`Migration hash mismatch at timestamp ${timestamp}.`);
    }
    return { timestamp, hash };
  });

  if (normalizedRows.length > expectedMigrations.length) {
    throw new Error(
      "Migration ledger contains more entries than the local migration chain.",
    );
  }

  normalizedRows.forEach((row, index) => {
    const expected = expectedMigrations[index];
    if (
      !expected ||
      row.timestamp !== expected.folderMillis ||
      row.hash !== expected.hash
    ) {
      throw new Error(
        "Migration ledger is not an exact prefix of the local migration chain.",
      );
    }
  });

  if (phase === "postflight") {
    if (!state.ledgerExists) {
      throw new Error("Migration ledger table is absent after migration.");
    }
    if (normalizedRows.length !== expectedMigrations.length) {
      throw new Error(
        "Migration ledger does not exactly match the local migration chain after migration.",
      );
    }
    if (!state.publicSchemaNonEmpty) {
      throw new Error("Public schema is empty after migration.");
    }
  }

  return normalizedRows.length;
}

export function assertRlsCoverage(rows: readonly RlsCoverageRow[]): void {
  const byTable = new Map<string, RlsCoverageRow>();
  for (const row of rows) {
    if (byTable.has(row.table_name)) {
      throw new Error(
        `Duplicate RLS coverage row for public.${row.table_name}.`,
      );
    }
    byTable.set(row.table_name, row);

    if (!row.table_exists) {
      throw new Error(
        `Required RLS table public.${row.table_name} does not exist.`,
      );
    }
    if (!row.row_security || !row.force_row_security) {
      throw new Error(
        `RLS must be enabled and forced on public.${row.table_name}.`,
      );
    }
    if (row.has_tenant_id && row.policies.length === 0) {
      throw new Error(
        `Tenant table public.${row.table_name} has no RLS policy.`,
      );
    }
  }

  for (const [table, requiredPolicies] of Object.entries(
    REQUIRED_SPECIAL_POLICIES,
  )) {
    const coverage = byTable.get(table);
    if (!coverage) {
      throw new Error(
        `RLS coverage did not include required table public.${table}.`,
      );
    }
    const actualPolicies = new Set(coverage.policies);
    const missing = requiredPolicies.filter(
      (policy) => !actualPolicies.has(policy),
    );
    if (missing.length > 0) {
      throw new Error(
        `public.${table} is missing required RLS policies: ${missing.join(", ")}.`,
      );
    }
  }
}

export function assertDeploymentRuntimeRoleIsSafe(
  target: DeploymentTarget,
  runtimeRole: string,
  rows: readonly DeploymentRuntimeRoleAttributes[],
): DeploymentRuntimeRoleAttributes {
  if (rows.length !== 1) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must name exactly one existing PostgreSQL role.`,
    );
  }

  const attributes = rows[0];
  if (
    !attributes ||
    attributes.role_name !== runtimeRole ||
    !attributes.migration_owner
  ) {
    throw new Error(
      `Could not verify ${DEPLOYMENT_RUNTIME_ROLE_ENV} against the connected database.`,
    );
  }
  if (attributes.role_name === attributes.migration_owner) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must be separate from the migration owner.`,
    );
  }
  if (target !== "ci" && attributes.can_login !== true) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must have LOGIN for ${target} deployments.`,
    );
  }

  const unsafeAttributes = [
    ["SUPERUSER", attributes.is_superuser],
    ["BYPASSRLS", attributes.bypass_rls],
    ["CREATEROLE", attributes.create_role],
    ["CREATEDB", attributes.create_db],
    ["REPLICATION", attributes.replication],
    ["role membership", attributes.has_role_memberships],
    ["ownership of the current database", attributes.owns_current_database],
    ["ownership of schema public", attributes.owns_public_schema],
    ["ownership of schema drizzle", attributes.owns_drizzle_schema],
    ["ownership of schema app_private", attributes.owns_app_private_schema],
    [
      "ownership of public/drizzle relations or sequences",
      attributes.owns_public_or_drizzle_relations,
    ],
    [
      "ownership of public/drizzle functions",
      attributes.owns_public_or_drizzle_functions,
    ],
    [
      "ownership of app_private functions",
      attributes.owns_app_private_functions,
    ],
    ["CREATE on schema public", attributes.can_create_in_public_schema],
    ["CREATE on schema drizzle", attributes.can_create_in_drizzle_schema],
    [
      "CREATE on schema app_private",
      attributes.can_create_in_app_private_schema,
    ],
  ]
    .filter(([, enabled]) => enabled !== false)
    .map(([name]) => name);
  if (unsafeAttributes.length > 0) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must be least privilege; unsafe role attributes: ${unsafeAttributes.join(", ")}.`,
    );
  }

  return attributes;
}

export function assertDeploymentRuntimeRolePrivileges(
  runtimeRole: string,
  rows: readonly DeploymentRuntimeRolePrivileges[],
): void {
  if (rows.length !== 1) {
    throw new Error(
      `Could not verify privileges for ${DEPLOYMENT_RUNTIME_ROLE_ENV}.`,
    );
  }

  const privileges = rows[0];
  const missing = [
    ["USAGE on schema public", privileges?.public_schema_usage],
    ["USAGE on schema drizzle", privileges?.drizzle_schema_usage],
    ["USAGE on schema app_private", privileges?.app_private_schema_usage],
    ["DML on all public tables", privileges?.public_tables_dml],
    ["only DML on public tables", privileges?.public_tables_only_dml],
    ["sequence privileges in public", privileges?.public_sequences_usage],
    [
      "SELECT on drizzle.__drizzle_migrations",
      privileges?.migration_ledger_select,
    ],
    [
      "only SELECT on drizzle.__drizzle_migrations",
      privileges?.migration_ledger_only_select,
    ],
    [
      "EXECUTE on required app_private RLS functions",
      privileges?.required_app_private_function_execute,
    ],
    [
      "only required app_private function EXECUTE",
      privileges?.only_required_app_private_function_execute,
    ],
    ["default public table DML", privileges?.default_table_privileges],
    [
      "only default public table DML",
      privileges?.default_table_privileges_only_dml,
    ],
    [
      "default public sequence privileges",
      privileges?.default_sequence_privileges,
    ],
    [
      "restricted default app_private function privileges",
      privileges?.default_app_private_functions_restricted,
    ],
  ]
    .filter(([, granted]) => granted !== true)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Privilege verification failed for runtime role ${runtimeRole}: ${missing.join(", ")}.`,
    );
  }
}

function validateLockOptions(
  options: LockOptions,
): Required<Omit<LockOptions, "lockName">> & { lockName: string } {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MIGRATION_LOCK_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_MIGRATION_LOCK_RETRY_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error(
      "Migration lock timeout must be a non-negative finite number.",
    );
  }
  if (!Number.isFinite(retryMs) || retryMs <= 0) {
    throw new Error(
      "Migration lock retry interval must be a positive finite number.",
    );
  }
  return {
    lockName: options.lockName ?? DEPLOYMENT_MIGRATION_LOCK_NAME,
    now: options.now ?? Date.now,
    retryMs,
    sleep:
      options.sleep ??
      (async (milliseconds) => {
        await sleepFor(milliseconds);
      }),
    timeoutMs,
  };
}

export async function acquireMigrationLock(
  client: SqlClient,
  options: LockOptions = {},
): Promise<void> {
  const resolved = validateLockOptions(options);
  const startedAt = resolved.now();

  while (true) {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [resolved.lockName],
    );
    if (result.rows[0]?.acquired === true) return;

    const elapsed = resolved.now() - startedAt;
    if (elapsed >= resolved.timeoutMs) {
      throw new Error(
        `Timed out after ${resolved.timeoutMs}ms waiting for the deployment migration lock.`,
      );
    }
    await resolved.sleep(
      Math.min(resolved.retryMs, resolved.timeoutMs - elapsed),
    );
  }
}

async function releaseMigrationLock(
  client: SqlClient,
  lockName: string,
): Promise<void> {
  const result = await client.query<{ released: boolean }>(
    "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
    [lockName],
  );
  if (result.rows[0]?.released !== true) {
    throw new Error(
      "The deployment migration advisory lock was not held during cleanup.",
    );
  }
}

export async function withMigrationLock<T>(
  client: SqlClient,
  work: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const resolved = validateLockOptions(options);
  await acquireMigrationLock(client, resolved);

  let result: T | undefined;
  let workFailed = false;
  let workError: unknown;
  try {
    result = await work();
  } catch (error) {
    workFailed = true;
    workError = error;
  }

  let unlockError: unknown;
  try {
    await releaseMigrationLock(client, resolved.lockName);
  } catch (error) {
    unlockError = error;
  }

  if (workFailed && unlockError) {
    throw new AggregateError(
      [workError, unlockError],
      "Migration failed and advisory-lock cleanup also failed.",
    );
  }
  if (workFailed) throw workError;
  if (unlockError) throw unlockError;
  return result as T;
}

export async function withDeploymentTransaction<T>(
  client: SqlClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    let rollbackError: unknown;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure;
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Deployment transaction failed and rollback also failed.",
      );
    }
    throw error;
  }
}

export async function applyDeploymentSchemaTransaction(
  client: SqlClient,
  migrations: readonly DeploymentMigration[],
  appliedBefore: number,
  tenantRlsSql: string,
  verifyAndGrantBeforeCommit: () => Promise<void>,
): Promise<void> {
  if (
    !Number.isSafeInteger(appliedBefore) ||
    appliedBefore < 0 ||
    appliedBefore > migrations.length
  ) {
    throw new Error("Deployment migration prefix length is invalid.");
  }
  for (const migration of migrations) {
    assertNoEmbeddedTransactionControl(
      migration.sql,
      `Migration ${migration.migrationPath}`,
    );
  }
  assertNoEmbeddedTransactionControl(tenantRlsSql, "Tenant RLS SQL");

  await withDeploymentTransaction(client, async () => {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
       )`,
    );

    for (const migration of migrations.slice(appliedBefore)) {
      if (migration.statements.length === 0) {
        throw new Error(
          `Migration ${migration.migrationPath} contains no executable statements.`,
        );
      }
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} (hash, created_at)
         VALUES ($1, $2)`,
        [migration.hash, migration.folderMillis],
      );
    }

    // This must remain before all postflight/grant checks and the single COMMIT.
    // New tables may inherit runtime ACLs, but no other session can observe them
    // until their RLS policy and complete least-privilege state are verified.
    await client.query(tenantRlsSql);
    await verifyAndGrantBeforeCommit();
  });
}

function resolveDeploymentPaths(cwd: string): DeploymentPaths {
  const candidates = [resolve(cwd), resolve(cwd, "apps/web")];
  for (const webRoot of candidates) {
    const migrationsFolder = resolve(webRoot, "drizzle");
    const journal = resolve(migrationsFolder, "meta/_journal.json");
    const maintenanceRecord = resolve(
      webRoot,
      "../..",
      MAINTENANCE_RECORD_PATH,
    );
    const tenantRlsSql = resolve(
      webRoot,
      "../../packages/api/src/db/migrations/tenant-rls.sql",
    );
    if (
      existsSync(journal) &&
      existsSync(maintenanceRecord) &&
      existsSync(tenantRlsSql)
    ) {
      return { maintenanceRecord, migrationsFolder, tenantRlsSql };
    }
  }
  throw new Error(
    "Could not resolve the School SIS migration, destructive-maintenance, and tenant-RLS files from the working directory.",
  );
}

interface DrizzleJournalEntry {
  tag: string;
  when: number;
}

function readDeploymentMigrations(
  paths: DeploymentPaths,
): DeploymentMigration[] {
  const journalPath = resolve(paths.migrationsFolder, "meta/_journal.json");
  let journal: unknown;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Drizzle migration journal is not valid JSON: ${detail}`);
  }
  if (
    !isPlainObject(journal) ||
    !Array.isArray(journal.entries) ||
    journal.entries.some(
      (entry) =>
        !isPlainObject(entry) ||
        !Number.isSafeInteger(entry.when) ||
        (entry.when as number) <= 0 ||
        typeof entry.tag !== "string" ||
        !/^[A-Za-z0-9_-]+$/u.test(entry.tag),
    )
  ) {
    throw new Error("Drizzle migration journal entries are malformed.");
  }

  const entries = journal.entries as Array<
    Record<string, unknown> & DrizzleJournalEntry
  >;
  const migrationConfig = {
    migrationsFolder: paths.migrationsFolder,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  };
  const migrations = readMigrationFiles(migrationConfig);
  if (migrations.length !== entries.length) {
    throw new Error(
      "Drizzle migration files do not exactly match the migration journal.",
    );
  }

  return migrations.map((migration, index) => {
    const entry = entries[index];
    if (!entry || entry.when !== migration.folderMillis) {
      throw new Error(
        "Drizzle migration file order does not exactly match the migration journal.",
      );
    }
    const migrationPath = `apps/web/drizzle/${entry.tag}.sql`;
    return {
      folderMillis: migration.folderMillis,
      hash: migration.hash,
      migrationPath,
      sql: readFileSync(
        resolve(paths.migrationsFolder, `${entry.tag}.sql`),
        "utf8",
      ),
      statements: migration.sql,
    };
  });
}

function readDestructiveMigrationMaintenanceRecords(
  path: string,
): DestructiveMigrationMaintenanceRecord[] {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Destructive-migration maintenance record is not valid JSON: ${detail}`,
    );
  }
  return parseDestructiveMigrationMaintenanceRecords(document);
}

async function readMigrationDatabaseState(
  client: SqlClient,
): Promise<MigrationDatabaseState> {
  const inventory = await client.query<{
    ledger_exists: boolean;
    public_schema_nonempty: boolean;
  }>(`
        SELECT
            to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_exists,
            EXISTS (
                SELECT 1 FROM (
                    SELECT classes.oid
                    FROM pg_class classes
                    JOIN pg_namespace namespaces ON namespaces.oid = classes.relnamespace
                    WHERE namespaces.nspname = 'public'
                      AND classes.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')

                    UNION ALL

                    SELECT types.oid
                    FROM pg_type types
                    JOIN pg_namespace namespaces ON namespaces.oid = types.typnamespace
                    WHERE namespaces.nspname = 'public'
                      AND types.typtype IN ('d', 'e')
                      AND NOT EXISTS (
                          SELECT 1
                          FROM pg_depend dependencies
                          WHERE dependencies.classid = 'pg_type'::regclass
                            AND dependencies.objid = types.oid
                            AND dependencies.refclassid = 'pg_extension'::regclass
                            AND dependencies.deptype = 'e'
                      )

                    UNION ALL

                    SELECT routines.oid
                    FROM pg_proc routines
                    JOIN pg_namespace namespaces ON namespaces.oid = routines.pronamespace
                    WHERE namespaces.nspname = 'public'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM pg_depend dependencies
                          WHERE dependencies.classid = 'pg_proc'::regclass
                            AND dependencies.objid = routines.oid
                            AND dependencies.refclassid = 'pg_extension'::regclass
                            AND dependencies.deptype = 'e'
                      )
                ) user_objects
            ) AS public_schema_nonempty
    `);
  const ledgerExists = inventory.rows[0]?.ledger_exists === true;
  const ledgerRows = ledgerExists
    ? (
        await client.query<MigrationLedgerRow>(`
            SELECT hash, created_at::text AS created_at
            FROM drizzle.__drizzle_migrations
            ORDER BY created_at ASC, id ASC
        `)
      ).rows
    : [];

  return {
    ledgerExists,
    ledgerRows,
    publicSchemaNonEmpty: inventory.rows[0]?.public_schema_nonempty === true,
  };
}

async function readRlsCoverage(client: SqlClient): Promise<RlsCoverageRow[]> {
  const result = await client.query<RlsCoverageRow>(`
        WITH tenant_tables AS (
            SELECT DISTINCT columns.table_name
            FROM information_schema.columns columns
            JOIN information_schema.tables tables
              ON tables.table_schema = columns.table_schema
             AND tables.table_name = columns.table_name
            WHERE columns.table_schema = 'public'
              AND columns.column_name = 'tenant_id'
              AND tables.table_type = 'BASE TABLE'
        ), required_tables AS (
            SELECT table_name FROM tenant_tables
            UNION
            SELECT unnest(ARRAY['tenants', 'companies'])
        )
        SELECT
            required.table_name,
            classes.oid IS NOT NULL AS table_exists,
            tenant.table_name IS NOT NULL AS has_tenant_id,
            COALESCE(classes.relrowsecurity, false) AS row_security,
            COALESCE(classes.relforcerowsecurity, false) AS force_row_security,
            ARRAY(
                SELECT policies.policyname::text
                FROM pg_policies policies
                WHERE policies.schemaname = 'public'
                  AND policies.tablename = required.table_name
                ORDER BY policies.policyname
            ) AS policies
        FROM required_tables required
        LEFT JOIN tenant_tables tenant ON tenant.table_name = required.table_name
        LEFT JOIN pg_namespace namespaces ON namespaces.nspname = 'public'
        LEFT JOIN pg_class classes
          ON classes.relnamespace = namespaces.oid
         AND classes.relname = required.table_name
         AND classes.relkind IN ('r', 'p')
        ORDER BY required.table_name
    `);
  return result.rows;
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function readDeploymentRuntimeRoleAttributes(
  client: SqlClient,
  runtimeRole: string,
): Promise<DeploymentRuntimeRoleAttributes[]> {
  const result = await client.query<DeploymentRuntimeRoleAttributes>(
    `SELECT
            roles.rolname::text AS role_name,
            current_user::text AS migration_owner,
            roles.rolcanlogin AS can_login,
            roles.rolsuper AS is_superuser,
            roles.rolbypassrls AS bypass_rls,
            roles.rolcreaterole AS create_role,
            roles.rolcreatedb AS create_db,
            roles.rolreplication AS replication,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_auth_members memberships
                WHERE memberships.member = roles.oid
            ) AS has_role_memberships,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_database databases
                WHERE databases.datname = current_database()
                  AND databases.datdba = roles.oid
            ) AS owns_current_database,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'public'
                  AND namespaces.nspowner = roles.oid
            ) AS owns_public_schema,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'drizzle'
                  AND namespaces.nspowner = roles.oid
            ) AS owns_drizzle_schema,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'app_private'
                  AND namespaces.nspowner = roles.oid
            ) AS owns_app_private_schema,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_class classes
                JOIN pg_catalog.pg_namespace namespaces
                  ON namespaces.oid = classes.relnamespace
                WHERE namespaces.nspname IN ('public', 'drizzle')
                  AND classes.relowner = roles.oid
            ) AS owns_public_or_drizzle_relations,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc functions
                JOIN pg_catalog.pg_namespace namespaces
                  ON namespaces.oid = functions.pronamespace
                WHERE namespaces.nspname IN ('public', 'drizzle')
                  AND functions.proowner = roles.oid
            ) AS owns_public_or_drizzle_functions,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc functions
                JOIN pg_catalog.pg_namespace namespaces
                  ON namespaces.oid = functions.pronamespace
                WHERE namespaces.nspname = 'app_private'
                  AND functions.proowner = roles.oid
            ) AS owns_app_private_functions,
            COALESCE((
                SELECT has_schema_privilege(roles.oid, namespaces.oid, 'CREATE')
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'public'
            ), false) AS can_create_in_public_schema,
            COALESCE((
                SELECT has_schema_privilege(roles.oid, namespaces.oid, 'CREATE')
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'drizzle'
            ), false) AS can_create_in_drizzle_schema,
            COALESCE((
                SELECT has_schema_privilege(roles.oid, namespaces.oid, 'CREATE')
                FROM pg_catalog.pg_namespace namespaces
                WHERE namespaces.nspname = 'app_private'
            ), false) AS can_create_in_app_private_schema
        FROM pg_catalog.pg_roles roles
        WHERE roles.rolname = $1`,
    [runtimeRole],
  );
  return result.rows;
}

async function readDeploymentRuntimeRolePrivileges(
  client: SqlClient,
  runtimeRole: string,
): Promise<DeploymentRuntimeRolePrivileges[]> {
  const result = await client.query<DeploymentRuntimeRolePrivileges>(
    `WITH public_relations AS (
            SELECT classes.oid, classes.relacl, classes.relowner
            FROM pg_catalog.pg_class classes
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = classes.relnamespace
            WHERE namespaces.nspname = 'public'
              AND classes.relkind IN ('r', 'p', 'v', 'm', 'f')
        ), public_sequences AS (
            SELECT classes.oid
            FROM pg_catalog.pg_class classes
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = classes.relnamespace
            WHERE namespaces.nspname = 'public'
              AND classes.relkind = 'S'
        ), runtime_role AS (
            SELECT roles.oid
            FROM pg_catalog.pg_roles roles
            WHERE roles.rolname = $1
        ), migration_owner AS (
            SELECT roles.oid
            FROM pg_catalog.pg_roles roles
            WHERE roles.rolname = current_user
        ), effective_public_relation_privileges AS (
            SELECT
                relations.oid,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM public_relations relations
            CROSS JOIN LATERAL aclexplode(COALESCE(
                relations.relacl,
                acldefault('r', relations.relowner)
            )) grants
            CROSS JOIN runtime_role
            WHERE grants.grantee IN (0, runtime_role.oid)

            UNION ALL

            SELECT
                attributes.attrelid AS oid,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_attribute attributes
            JOIN public_relations relations
              ON relations.oid = attributes.attrelid
            CROSS JOIN LATERAL aclexplode(attributes.attacl) grants
            CROSS JOIN runtime_role
            WHERE attributes.attacl IS NOT NULL
              AND grants.grantee IN (0, runtime_role.oid)
        ), effective_ledger_privileges AS (
            SELECT
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_class ledger
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = ledger.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(
                ledger.relacl,
                acldefault('r', ledger.relowner)
            )) grants
            CROSS JOIN runtime_role
            WHERE namespaces.nspname = 'drizzle'
              AND ledger.relname = '__drizzle_migrations'
              AND ledger.relkind IN ('r', 'p')
              AND grants.grantee IN (0, runtime_role.oid)

            UNION ALL

            SELECT
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_attribute attributes
            JOIN pg_catalog.pg_class ledger ON ledger.oid = attributes.attrelid
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = ledger.relnamespace
            CROSS JOIN LATERAL aclexplode(attributes.attacl) grants
            CROSS JOIN runtime_role
            WHERE namespaces.nspname = 'drizzle'
              AND ledger.relname = '__drizzle_migrations'
              AND ledger.relkind IN ('r', 'p')
              AND attributes.attacl IS NOT NULL
              AND grants.grantee IN (0, runtime_role.oid)
        ), app_private_functions AS (
            SELECT
                functions.oid,
                functions.proname,
                functions.pronargs,
                functions.proacl,
                functions.proowner,
                (
                    functions.pronargs = 0
                    AND functions.proname IN (
                        'current_tenant_id',
                        'has_tenant_context',
                        'rls_bypass'
                    )
                ) AS is_required
            FROM pg_catalog.pg_proc functions
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = functions.pronamespace
            WHERE namespaces.nspname = 'app_private'
        ), effective_app_private_function_privileges AS (
            SELECT
                functions.oid,
                functions.is_required,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM app_private_functions functions
            CROSS JOIN LATERAL aclexplode(COALESCE(
                functions.proacl,
                acldefault('f', functions.proowner)
            )) grants
            CROSS JOIN runtime_role
            WHERE grants.grantee IN (0, runtime_role.oid)
        ), required_default_privileges(object_type, privilege_type) AS (
            VALUES
                ('r', 'SELECT'),
                ('r', 'INSERT'),
                ('r', 'UPDATE'),
                ('r', 'DELETE'),
                ('S', 'USAGE'),
                ('S', 'SELECT'),
                ('S', 'UPDATE')
        ), actual_default_privileges AS (
            SELECT
                defaults.defaclobjtype::text AS object_type,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_default_acl defaults
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) grants
            CROSS JOIN runtime_role
            WHERE defaults.defaclrole = (SELECT oid FROM migration_owner)
              AND defaults.defaclnamespace = (
                  SELECT namespaces.oid
                  FROM pg_catalog.pg_namespace namespaces
                  WHERE namespaces.nspname = 'public'
              )
              AND grants.grantee IN (0, runtime_role.oid)
        ), actual_app_private_default_function_privileges AS (
            SELECT
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_default_acl defaults
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) grants
            CROSS JOIN runtime_role
            WHERE defaults.defaclrole = (SELECT oid FROM migration_owner)
              AND defaults.defaclobjtype = 'f'
              AND defaults.defaclnamespace = (
                  SELECT namespaces.oid
                  FROM pg_catalog.pg_namespace namespaces
                  WHERE namespaces.nspname = 'app_private'
              )
              AND grants.grantee IN (0, runtime_role.oid)
        )
        SELECT
            COALESCE(has_schema_privilege($1, 'public', 'USAGE'), false)
                AS public_schema_usage,
            COALESCE(has_schema_privilege($1, 'drizzle', 'USAGE'), false)
                AS drizzle_schema_usage,
            COALESCE(has_schema_privilege($1, 'app_private', 'USAGE'), false)
                AS app_private_schema_usage,
            COALESCE((
                SELECT bool_and(has_table_privilege(
                    $1,
                    relations.oid,
                    'SELECT,INSERT,UPDATE,DELETE'
                ))
                FROM public_relations relations
            ), true) AS public_tables_dml,
            NOT EXISTS (
                SELECT 1
                FROM effective_public_relation_privileges privileges
                WHERE privileges.privilege_type NOT IN (
                    'SELECT', 'INSERT', 'UPDATE', 'DELETE'
                )
                   OR privileges.is_grantable
            ) AS public_tables_only_dml,
            COALESCE((
                SELECT bool_and(has_sequence_privilege(
                    $1,
                    sequences.oid,
                    'USAGE,SELECT,UPDATE'
                ))
                FROM public_sequences sequences
            ), true) AS public_sequences_usage,
            (
                to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
                AND COALESCE(has_table_privilege(
                    $1,
                    to_regclass('drizzle.__drizzle_migrations'),
                    'SELECT'
                ), false)
            ) AS migration_ledger_select,
            NOT EXISTS (
                SELECT 1
                FROM effective_ledger_privileges privileges
                WHERE privileges.privilege_type <> 'SELECT'
                   OR privileges.is_grantable
            ) AS migration_ledger_only_select,
            (
                SELECT
                    count(*) = 3
                    AND bool_and(
                        has_function_privilege($1, functions.oid, 'EXECUTE')
                        AND EXISTS (
                            SELECT 1
                            FROM aclexplode(COALESCE(
                                functions.proacl,
                                acldefault('f', functions.proowner)
                            )) grants
                            CROSS JOIN runtime_role
                            WHERE grants.grantee = runtime_role.oid
                              AND grants.privilege_type = 'EXECUTE'
                        )
                    )
                FROM app_private_functions functions
                WHERE functions.is_required
            ) AS required_app_private_function_execute,
            NOT EXISTS (
                SELECT 1
                FROM effective_app_private_function_privileges privileges
                WHERE NOT privileges.is_required
                   OR privileges.privilege_type <> 'EXECUTE'
                   OR privileges.is_grantable
            ) AS only_required_app_private_function_execute,
            NOT EXISTS (
                SELECT 1
                FROM required_default_privileges required
                WHERE required.object_type = 'r'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM actual_default_privileges actual
                      WHERE actual.object_type = required.object_type
                        AND actual.privilege_type = required.privilege_type
                  )
            ) AS default_table_privileges,
            NOT EXISTS (
                SELECT 1
                FROM actual_default_privileges actual
                WHERE actual.object_type = 'r'
                  AND (
                      actual.privilege_type NOT IN (
                          'SELECT', 'INSERT', 'UPDATE', 'DELETE'
                      )
                      OR actual.is_grantable
                  )
            ) AS default_table_privileges_only_dml,
            NOT EXISTS (
                SELECT 1
                FROM required_default_privileges required
                WHERE required.object_type = 'S'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM actual_default_privileges actual
                      WHERE actual.object_type = required.object_type
                        AND actual.privilege_type = required.privilege_type
                  )
            ) AS default_sequence_privileges,
            NOT EXISTS (
                SELECT 1
                FROM actual_app_private_default_function_privileges actual
            ) AS default_app_private_functions_restricted`,
    [runtimeRole],
  );
  return result.rows;
}

async function grantAndVerifyDeploymentRuntimeRole(
  client: SqlClient,
  runtimeRole: string,
  migrationOwner: string,
): Promise<void> {
  const quotedRuntimeRole = quotePostgresIdentifier(runtimeRole);
  const quotedMigrationOwner = quotePostgresIdentifier(migrationOwner);

  await client.query(
    `GRANT USAGE ON SCHEMA public, drizzle, app_private TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, ${quotedRuntimeRole}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION
          app_private.current_tenant_id(),
          app_private.has_tenant_context(),
          app_private.rls_bypass()
       TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA app_private
       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${quotedRuntimeRole}`,
  );
  assertDeploymentRuntimeRolePrivileges(
    runtimeRole,
    await readDeploymentRuntimeRolePrivileges(client, runtimeRole),
  );
}

async function configureMigrationSession(client: SqlClient): Promise<void> {
  await client.query(
    `SELECT
            set_config('statement_timeout', '900000', false),
            set_config('lock_timeout', '30000', false),
            set_config('idle_in_transaction_session_timeout', '900000', false)`,
  );
}

export async function runDeploymentMigrations(
  options: RunDeploymentMigrationsOptions,
): Promise<MigrationRunResult> {
  const environment = options.environment ?? process.env;
  const logger = options.logger ?? console;
  const connection = resolveDeploymentConnection(options.target, environment);
  const runtimeRole = resolveDeploymentRuntimeRole(options.target, environment);
  const paths = resolveDeploymentPaths(options.cwd ?? process.cwd());
  const deploymentMigrations = readDeploymentMigrations(paths);
  const expectedMigrations = normalizeExpectedMigrations(deploymentMigrations);
  const maintenanceRecords =
    options.target === "production"
      ? readDestructiveMigrationMaintenanceRecords(paths.maintenanceRecord)
      : [];
  const tenantRlsSql = readFileSync(paths.tenantRlsSql, "utf8");
  for (const migration of deploymentMigrations) {
    assertNoEmbeddedTransactionControl(
      migration.sql,
      `Migration ${migration.migrationPath}`,
    );
  }
  assertNoEmbeddedTransactionControl(tenantRlsSql, "Tenant RLS SQL");
  const client = new Client({
    ...resolveDatabaseConnectionOptions(
      connection.connectionString,
      connection.sslMode,
    ),
    application_name: `school-sis-deployment-migrations-${options.target}`,
  });

  let result: MigrationRunResult | undefined;
  let runFailed = false;
  let runError: unknown;
  try {
    await client.connect();
    await configureMigrationSession(client);
    result = await withMigrationLock(
      client,
      async () => {
        const preflight = await readMigrationDatabaseState(client);
        const appliedBefore = assertMigrationLedger(
          expectedMigrations,
          preflight,
          "preflight",
        );
        logger.info(
          `Migration preflight accepted ${appliedBefore}/${expectedMigrations.length} exact ledger entries.`,
        );

        if (options.target === "production") {
          assertProductionDestructiveMigrationPolicy(
            deploymentMigrations,
            maintenanceRecords,
            appliedBefore,
          );
          logger.info(
            `Production destructive-migration policy accepted ${maintenanceRecords.length} exact maintenance record(s); no recorded migration is pending automated application.`,
          );
        }

        if (runtimeRole) {
          assertDeploymentRuntimeRoleIsSafe(
            options.target,
            runtimeRole,
            await readDeploymentRuntimeRoleAttributes(client, runtimeRole),
          );
        }

        await applyDeploymentSchemaTransaction(
          client,
          deploymentMigrations,
          appliedBefore,
          tenantRlsSql,
          async () => {
            const postflight = await readMigrationDatabaseState(client);
            assertMigrationLedger(expectedMigrations, postflight, "postflight");
            assertRlsCoverage(await readRlsCoverage(client));
            if (runtimeRole) {
              const runtimeRoleAttributes = assertDeploymentRuntimeRoleIsSafe(
                options.target,
                runtimeRole,
                await readDeploymentRuntimeRoleAttributes(client, runtimeRole),
              );
              await grantAndVerifyDeploymentRuntimeRole(
                client,
                runtimeRole,
                runtimeRoleAttributes.migration_owner,
              );
            }
          },
        );
        logger.info(
          `Atomic migration commit verified ${expectedMigrations.length} ledger entries, tenant RLS coverage${runtimeRole ? ", and runtime-role privileges" : ""}.`,
        );

        return {
          appliedBefore,
          migrationCount: expectedMigrations.length,
          target: options.target,
        };
      },
      {
        retryMs: options.lockRetryMs,
        timeoutMs: options.lockTimeoutMs,
      },
    );
  } catch (error) {
    runFailed = true;
    runError = error;
  }

  let endError: unknown;
  try {
    await client.end();
  } catch (error) {
    endError = error;
  }

  if (runFailed && endError) {
    throw new AggregateError(
      [runError, endError],
      "Migration failed and database-client cleanup also failed.",
    );
  }
  if (runFailed) throw runError;
  if (endError) throw endError;
  return result!;
}
