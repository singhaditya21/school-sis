import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";
import { Client, type QueryResultRow } from "pg";
import { readMigrationFiles, type MigrationMeta } from "./read-migration-files";
import {
  resolveDatabaseConnectionOptions,
  type DatabaseSslMode,
} from "../../../packages/api/src/db/ssl";
import {
  LOCAL_TENANT_CONTEXT_AUDIENCE,
  LOCAL_TENANT_CONTEXT_KEY_ID,
  LOCAL_TENANT_CONTEXT_SECRET,
} from "../../../packages/api/src/db/tenant-context-config";

export const DEPLOYMENT_TARGETS = ["ci", "preview", "production"] as const;
export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[number];

export const DEPLOYMENT_MIGRATION_LOCK_NAME =
  "school-sis:deployment-migrations:v1";
export const DEPLOYMENT_RUNTIME_ROLE_ENV = "DEPLOYMENT_RUNTIME_ROLE";
export const DEPLOYMENT_PLATFORM_ROLE_ENV = "DEPLOYMENT_PLATFORM_ROLE";
export const REQUIRED_RUNTIME_ROLE = "school_sis_runtime";
export const REQUIRED_PLATFORM_ROLE = "school_sis_platform";
export const TENANT_CONTEXT_SIGNING_KEY_ID_ENV =
  "TENANT_CONTEXT_SIGNING_KEY_ID";
export const TENANT_CONTEXT_SIGNING_SECRET_ENV =
  "TENANT_CONTEXT_SIGNING_SECRET";
export const TENANT_CONTEXT_PREVIOUS_KEY_ID_ENV =
  "TENANT_CONTEXT_PREVIOUS_KEY_ID";
export const TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET_ENV =
  "TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET";
export const TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_ENV =
  "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY";
// Phase 1 ships the signer and verifier while preserving rollback compatibility.
// The reviewed phase-2 follow-up changes only this constant to 2 after the
// production workflow has recorded a successfully promoted signing runtime.
export const PRODUCTION_TENANT_CONTEXT_ENFORCEMENT_PHASE: 1 | 2 = 1;
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 60_000;
export const DEFAULT_MIGRATION_LOCK_RETRY_MS = 1_000;

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MAINTENANCE_RECORD_PATH =
  "scripts/destructive-migration-maintenance.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_POSTGRES_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const TENANT_CONTEXT_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const TENANT_CONTEXT_AUDIENCE_PATTERN = /^[a-z0-9][a-z0-9:._-]{2,191}$/;
const TENANT_CONTEXT_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
// Regenerate only from a clean application of tenant-rls.sql. The canonical
// catalog payload includes every public r/p policy's table, name, command,
// roles, permissiveness, USING expression, and WITH CHECK expression.
//
// ─── How to regenerate, and how to know you did it right ────────────────────
//
// Adding any table with a tenant_id column changes this, because tenant-rls.sql
// discovers such tables and gives each one a tenant_isolation_policy. The
// release then refuses to migrate with "The exact public RLS policy catalog
// does not match the reviewed tenant-RLS artifact" — deliberately, so a change
// to the isolation model cannot reach production unreviewed.
//
//   1. Build a scratch database and apply the whole chain in order, then
//      tenant-rls.sql. The chain needs the `vector` and `pgcrypto` extensions
//      created first, or 0000 fails on the embedding column.
//
//   2. FIRST reproduce the value you are replacing. Apply the chain WITHOUT the
//      new migration and run the query below: it must print the count and hash
//      currently pinned here. If it does not, the procedure is wrong and any
//      number it produces next is worthless. This is the step worth not
//      skipping — it is the only evidence the method is sound.
//
//   3. Then apply the chain WITH the new migration and run the query again.
//      Those are the new values.
//
//   4. Diff the two policy lists — not just the hashes — and confirm the delta
//      is exactly what the change should produce. A hash tells you something
//      moved; the list tells you what:
//
//        SELECT c.relname, p.polname FROM pg_policy p
//        JOIN pg_class c ON c.oid = p.polrelid
//        JOIN pg_namespace n ON n.oid = c.relnamespace
//        WHERE n.nspname = 'public' ORDER BY 1, 2;
//
//      Adding hardware_tokens should add one line and move nothing else. If a
//      policy changed shape or disappeared, that is a different review.
//
// The fingerprint query is the one this file already runs, kept identical here
// so the two cannot drift:
//
//   WITH policy_rows AS (
//       SELECT jsonb_build_object(
//           'table', classes.relname, 'policy', policies.polname,
//           'permissive', policies.polpermissive, 'command', policies.polcmd,
//           'roles', policies.polroles::text,
//           'using', pg_get_expr(policies.polqual, policies.polrelid, false),
//           'check', pg_get_expr(policies.polwithcheck, policies.polrelid, false)
//       )::text AS contract,
//       classes.relname::text AS table_name, policies.polname::text AS policy_name
//       FROM pg_catalog.pg_policy policies
//       JOIN pg_catalog.pg_class classes ON classes.oid = policies.polrelid
//       JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
//       WHERE namespaces.nspname = 'public' AND classes.relkind IN ('r', 'p')
//   )
//   SELECT count(*), encode(public.digest(convert_to(string_agg(
//       contract, E'\n' ORDER BY table_name, policy_name), 'UTF8'), 'sha256'), 'hex')
//   FROM policy_rows;
//
// The test fixture in deployment-migrations.test.ts imports both constants
// rather than copying them, so only these two lines need editing.
export const EXPECTED_RLS_POLICY_COUNT = 184;
export const EXPECTED_RLS_POLICY_CATALOG_SHA256 =
  "6b2ae4d491bd255a2aa0c5167b520ef9c05e4aff188107261f5eb4ebc2f05fae";
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
  owners: [
    "owners_tenant_isolation_select",
    "owners_tenant_isolation_insert",
    "owners_tenant_isolation_update",
    "owners_tenant_isolation_delete",
  ],
};

export interface DeploymentEnvironment {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  DATABASE_SSL_MODE?: string;
  DEPLOYMENT_RUNTIME_ROLE?: string;
  DEPLOYMENT_PLATFORM_ROLE?: string;
  TENANT_CONTEXT_SIGNING_KEY_ID?: string;
  TENANT_CONTEXT_SIGNING_SECRET?: string;
  TENANT_CONTEXT_AUDIENCE?: string;
  TENANT_CONTEXT_PREVIOUS_KEY_ID?: string;
  TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET?: string;
  TENANT_CONTEXT_RETIRE_PREVIOUS_KEY?: string;
  CURRENT_PRODUCTION_DEPLOYMENT_ID?: string;
  GIT_COMMIT_SHA?: string;
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
  policy_contract_count: number;
  policy_contract_sha256: string;
}

export interface DeploymentRoleMembershipEdge {
  member_role: string;
  granted_role: string;
  grantor_role: string;
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
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
  role_config: string[];
  database_role_setting_count: number;
  role_memberships: DeploymentRoleMembershipEdge[];
  owned_object_count: number;
  can_create_in_current_database: boolean;
  can_create_temporary_tables: boolean;
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

export interface TenantContextSigningKey {
  keyId: string;
  secret: string;
}

export interface TenantContextSigningKeyConfiguration {
  audience: string;
  current: TenantContextSigningKey;
  previous?: TenantContextSigningKey;
  retirePrevious: boolean;
  currentProductionDeploymentId?: string;
  releaseSha?: string;
}

export interface DeploymentRuntimeRolePrivileges {
  public_schema_usage: boolean;
  drizzle_schema_usage: boolean;
  app_private_schema_usage: boolean;
  public_tables_dml: boolean;
  public_sequences_usage: boolean;
  public_sequences_only_runtime_privileges: boolean;
  no_unsupported_public_relations: boolean;
  migration_ledger_select: boolean;
  public_tables_only_dml: boolean;
  migration_ledger_only_select: boolean;
  required_app_private_function_execute: boolean;
  only_required_app_private_function_execute: boolean;
  tenant_context_private_tables_inaccessible: boolean;
  no_unapproved_owner_security_definer_execute: boolean;
  no_unapproved_security_definer_triggers: boolean;
  no_unapproved_public_rewrite_rules: boolean;
  default_table_privileges: boolean;
  default_table_privileges_only_dml: boolean;
  default_sequence_privileges: boolean;
  default_app_private_functions_restricted: boolean;
}

export interface DeploymentMigrationOwnerAttributes {
  role_name: string;
  is_superuser: boolean;
  bypass_rls: boolean;
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
  if (runtimeRole !== REQUIRED_RUNTIME_ROLE) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} must equal ${REQUIRED_RUNTIME_ROLE} because the phase-1 rollback bridge pins that exact legacy identity.`,
    );
  }
  return runtimeRole;
}

export function resolveDeploymentPlatformRole(
  target: DeploymentTarget,
  environment: DeploymentEnvironment,
): string | undefined {
  const platformRole = nonBlank(environment.DEPLOYMENT_PLATFORM_ROLE);
  if (!platformRole) {
    if (target === "ci") return undefined;
    throw new Error(
      `${target} deployment migrations require ${DEPLOYMENT_PLATFORM_ROLE_ENV}.`,
    );
  }
  if (!SAFE_POSTGRES_IDENTIFIER_PATTERN.test(platformRole)) {
    throw new Error(
      `${DEPLOYMENT_PLATFORM_ROLE_ENV} must be a lowercase PostgreSQL identifier containing only letters, digits, and underscores, beginning with a letter or underscore, with at most 63 characters.`,
    );
  }
  if (platformRole !== REQUIRED_PLATFORM_ROLE) {
    throw new Error(
      `${DEPLOYMENT_PLATFORM_ROLE_ENV} must equal ${REQUIRED_PLATFORM_ROLE} because the RLS policy function pins that exact trusted identity.`,
    );
  }
  return platformRole;
}

function assertTenantContextKey(
  keyId: string | undefined,
  secret: string | undefined,
  idVariable: string,
  secretVariable: string,
): TenantContextSigningKey {
  if (!keyId || !TENANT_CONTEXT_KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      `${idVariable} must be a lowercase 1-32 character rotation identifier.`,
    );
  }
  if (!secret || !TENANT_CONTEXT_SECRET_PATTERN.test(secret)) {
    throw new Error(
      `${secretVariable} must be a 43-128 character base64url secret generated from at least 32 random bytes.`,
    );
  }
  return { keyId, secret };
}

export function resolveTenantContextSigningKeyConfiguration(
  target: DeploymentTarget,
  environment: DeploymentEnvironment,
  localConnection: boolean,
): TenantContextSigningKeyConfiguration {
  let currentKeyId = nonBlank(environment.TENANT_CONTEXT_SIGNING_KEY_ID);
  let currentSecret = environment.TENANT_CONTEXT_SIGNING_SECRET;
  let audience = nonBlank(environment.TENANT_CONTEXT_AUDIENCE);
  if (target === "ci" && localConnection && !currentKeyId && !currentSecret) {
    currentKeyId = LOCAL_TENANT_CONTEXT_KEY_ID;
    currentSecret = LOCAL_TENANT_CONTEXT_SECRET;
    audience = audience || LOCAL_TENANT_CONTEXT_AUDIENCE;
  }
  if (!audience || !TENANT_CONTEXT_AUDIENCE_PATTERN.test(audience)) {
    throw new Error(
      "TENANT_CONTEXT_AUDIENCE must be a lowercase deployment-specific audience.",
    );
  }
  const current = assertTenantContextKey(
    currentKeyId,
    currentSecret,
    TENANT_CONTEXT_SIGNING_KEY_ID_ENV,
    TENANT_CONTEXT_SIGNING_SECRET_ENV,
  );

  const previousKeyId = nonBlank(environment.TENANT_CONTEXT_PREVIOUS_KEY_ID);
  const previousSecret = environment.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET;
  if (Boolean(previousKeyId) !== Boolean(previousSecret)) {
    throw new Error(
      `${TENANT_CONTEXT_PREVIOUS_KEY_ID_ENV} and ${TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET_ENV} must be configured together.`,
    );
  }
  const previous = previousKeyId
    ? assertTenantContextKey(
        previousKeyId,
        previousSecret,
        TENANT_CONTEXT_PREVIOUS_KEY_ID_ENV,
        TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET_ENV,
      )
    : undefined;
  if (previous?.keyId === current.keyId) {
    throw new Error("Current and previous tenant-context key IDs must differ.");
  }
  if (previous?.secret === current.secret) {
    throw new Error("Current and previous tenant-context secrets must differ.");
  }

  const retireValue = nonBlank(environment.TENANT_CONTEXT_RETIRE_PREVIOUS_KEY);
  if (retireValue && retireValue !== "true") {
    throw new Error(
      `${TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_ENV} must be unset or exactly true.`,
    );
  }
  const retirePrevious = retireValue === "true";
  if (retirePrevious && previous) {
    throw new Error(
      `${TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_ENV}=true cannot be combined with a previous verification key.`,
    );
  }
  const currentProductionDeploymentId = nonBlank(
    environment.CURRENT_PRODUCTION_DEPLOYMENT_ID,
  );
  if (
    currentProductionDeploymentId &&
    !/^dpl_[A-Za-z0-9]+$/.test(currentProductionDeploymentId)
  ) {
    throw new Error(
      "CURRENT_PRODUCTION_DEPLOYMENT_ID must be an exact Vercel deployment ID.",
    );
  }

  return {
    audience,
    current,
    previous,
    retirePrevious,
    currentProductionDeploymentId,
    releaseSha: nonBlank(environment.GIT_COMMIT_SHA),
  };
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

function assertRequiredRemoteChannelBinding(url: URL): void {
  const channelBindingValues = [...url.searchParams.entries()]
    .filter(([key]) => key.toLowerCase() === "channel_binding")
    .map(([, value]) => value.toLowerCase());
  if (
    channelBindingValues.length !== 1 ||
    channelBindingValues[0] !== "require"
  ) {
    throw new Error(
      "Remote deployment URLs require exactly one channel_binding=require parameter.",
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
  if (!local) {
    assertNoRemoteSslDowngrade(parsed, configuredMode);
    assertRequiredRemoteChannelBinding(parsed);
  }

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
  if (rows.length === 0) {
    throw new Error("RLS coverage returned no governed public tables.");
  }
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
    if (row.policies.length === 0) {
      throw new Error(
        `Public table public.${row.table_name} has no RLS policy.`,
      );
    }
    if (
      row.policy_contract_count !== EXPECTED_RLS_POLICY_COUNT ||
      row.policy_contract_sha256 !== EXPECTED_RLS_POLICY_CATALOG_SHA256
    ) {
      throw new Error(
        "The exact public RLS policy catalog does not match the reviewed tenant-RLS artifact.",
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
  allowDefaultTemporaryPrivilege = false,
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

  const permittedProviderManagementEdge = (
    edge: DeploymentRoleMembershipEdge,
  ): boolean =>
    edge.member_role === attributes.migration_owner &&
    edge.granted_role === attributes.role_name &&
    typeof edge.grantor_role === "string" &&
    edge.grantor_role.length > 0 &&
    edge.admin_option === true &&
    edge.inherit_option === false &&
    edge.set_option === false;

  const roleMemberships = attributes.role_memberships;
  const hasOnlyPermittedRoleMembership =
    Array.isArray(roleMemberships) &&
    roleMemberships.length <= 1 &&
    roleMemberships.every(permittedProviderManagementEdge);
  const hasEmptyRoleConfig =
    Array.isArray(attributes.role_config) &&
    attributes.role_config.length === 0;

  const unsafeAttributes = [
    ["SUPERUSER", attributes.is_superuser],
    ["BYPASSRLS", attributes.bypass_rls],
    ["CREATEROLE", attributes.create_role],
    ["CREATEDB", attributes.create_db],
    ["REPLICATION", attributes.replication],
    ["role membership", !hasOnlyPermittedRoleMembership],
    ["role settings (rolconfig)", !hasEmptyRoleConfig],
    [
      "database/role settings (pg_db_role_setting)",
      attributes.database_role_setting_count !== 0,
    ],
    [
      "ownership of catalog-visible database objects",
      attributes.owned_object_count !== 0,
    ],
    [
      "CREATE on the current database",
      attributes.can_create_in_current_database,
    ],
    [
      "TEMPORARY on the current database",
      attributes.can_create_temporary_tables && !allowDefaultTemporaryPrivilege,
    ],
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

export function assertDeploymentApplicationRolesAreDistinct(
  runtimeRole: string | undefined,
  platformRole: string | undefined,
): void {
  if (runtimeRole && platformRole && runtimeRole === platformRole) {
    throw new Error(
      `${DEPLOYMENT_RUNTIME_ROLE_ENV} and ${DEPLOYMENT_PLATFORM_ROLE_ENV} must be distinct roles.`,
    );
  }
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
    [
      "no public views, materialized views, or foreign tables",
      privileges?.no_unsupported_public_relations,
    ],
    ["sequence privileges in public", privileges?.public_sequences_usage],
    [
      "only non-grantable app-role sequence privileges",
      privileges?.public_sequences_only_runtime_privileges,
    ],
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
    [
      "no access to tenant-context private state",
      privileges?.tenant_context_private_tables_inaccessible,
    ],
    [
      "no unapproved executable SECURITY DEFINER functions",
      privileges?.no_unapproved_owner_security_definer_execute,
    ],
    [
      "no SECURITY DEFINER trigger functions",
      privileges?.no_unapproved_security_definer_triggers,
    ],
    [
      "no user rewrite rules on public tables",
      privileges?.no_unapproved_public_rewrite_rules,
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

export async function assertTenantContextPreDdlContract(
  client: SqlClient,
): Promise<void> {
  const inventory = await client.query<{
    app_private_schema_safe: boolean;
    event_trigger_count: number;
    key_table_exists: boolean;
    rollout_table_exists: boolean;
  }>(`
      SELECT
          (SELECT count(*)::integer FROM pg_catalog.pg_event_trigger)
              AS event_trigger_count,
          to_regclass('app_private.tenant_context_signing_keys') IS NOT NULL
              AS key_table_exists,
          to_regclass('app_private.tenant_context_rollout_state') IS NOT NULL
              AS rollout_table_exists,
          COALESCE((
              SELECT
                  namespaces.nspowner = (
                      SELECT roles.oid
                      FROM pg_catalog.pg_roles roles
                      WHERE roles.rolname = current_user
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM aclexplode(COALESCE(
                          namespaces.nspacl,
                          acldefault('n', namespaces.nspowner)
                      )) grants
                      WHERE grants.grantee <> namespaces.nspowner
                        AND (grants.privilege_type <> 'USAGE' OR grants.is_grantable)
                  )
              FROM pg_catalog.pg_namespace namespaces
              WHERE namespaces.nspname = 'app_private'
          ), true) AS app_private_schema_safe
  `);
  const row = inventory.rows[0];
  if (
    inventory.rows.length !== 1 ||
    !row ||
    row.event_trigger_count !== 0 ||
    row.app_private_schema_safe !== true ||
    row.key_table_exists !== row.rollout_table_exists
  ) {
    throw new Error(
      "Tenant-context pre-DDL state is unsafe; refusing to execute migrations while private storage or event triggers are untrusted.",
    );
  }
  if (row.key_table_exists) {
    await client.query(
      `LOCK TABLE
         app_private.tenant_context_signing_keys,
         app_private.tenant_context_rollout_state
       IN ACCESS EXCLUSIVE MODE`,
    );
    await assertTenantContextPreProvisionContract(client);
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
    await assertTenantContextPreDdlContract(client);
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

export async function readRlsCoverage(
  client: SqlClient,
): Promise<RlsCoverageRow[]> {
  const result = await client.query<RlsCoverageRow>(`
        WITH policy_rows AS (
            SELECT jsonb_build_object(
                'table', classes.relname,
                'policy', policies.polname,
                'permissive', policies.polpermissive,
                'command', policies.polcmd,
                'roles', policies.polroles::text,
                'using', pg_get_expr(policies.polqual, policies.polrelid, false),
                'check', pg_get_expr(policies.polwithcheck, policies.polrelid, false)
            )::text AS contract,
            classes.relname::text AS table_name,
            policies.polname::text AS policy_name
            FROM pg_catalog.pg_policy policies
            JOIN pg_catalog.pg_class classes ON classes.oid = policies.polrelid
            JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = classes.relnamespace
            WHERE namespaces.nspname = 'public'
              AND classes.relkind IN ('r', 'p')
        ), policy_contract AS (
            SELECT
                count(*)::integer AS policy_contract_count,
                encode(public.digest(
                    convert_to(string_agg(
                        contract,
                        E'\\n' ORDER BY table_name, policy_name
                    ), 'UTF8'),
                    'sha256'
                ), 'hex') AS policy_contract_sha256
            FROM policy_rows
        )
        SELECT
            classes.relname::text AS table_name,
            true AS table_exists,
            EXISTS (
                SELECT 1
                FROM pg_attribute attributes
                WHERE attributes.attrelid = classes.oid
                  AND attributes.attname = 'tenant_id'
                  AND attributes.attnum > 0
                  AND NOT attributes.attisdropped
            ) AS has_tenant_id,
            classes.relrowsecurity AS row_security,
            classes.relforcerowsecurity AS force_row_security,
            ARRAY(
                SELECT policies.polname::text
                FROM pg_policy policies
                WHERE policies.polrelid = classes.oid
                ORDER BY policies.polname
            ) AS policies,
            policy_contract.policy_contract_count,
            policy_contract.policy_contract_sha256
        FROM pg_class classes
        JOIN pg_namespace namespaces ON namespaces.oid = classes.relnamespace
        CROSS JOIN policy_contract
        WHERE namespaces.nspname = 'public'
          AND classes.relkind IN ('r', 'p')
        ORDER BY classes.relname
    `);
  return result.rows;
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function assertMigrationOwnerCanMaintainForcedRls(
  client: SqlClient,
  target: DeploymentTarget,
): Promise<void> {
  const result = await client.query<DeploymentMigrationOwnerAttributes>(`
      SELECT
          roles.rolname::text AS role_name,
          roles.rolsuper AS is_superuser,
          roles.rolbypassrls AS bypass_rls
      FROM pg_catalog.pg_roles roles
      WHERE roles.rolname = current_user
  `);
  const owner = result.rows[0];
  if (result.rows.length !== 1 || !owner?.role_name) {
    throw new Error("Could not verify the connected migration owner.");
  }
  if (
    (target === "preview" || target === "production") &&
    owner.bypass_rls !== true
  ) {
    throw new Error(
      `The ${target} migration owner must have BYPASSRLS so locked migrations can maintain FORCE RLS tables without an application-visible owner bypass.`,
    );
  }
  if (
    target === "ci" &&
    owner.bypass_rls !== true &&
    owner.is_superuser !== true
  ) {
    throw new Error(
      "The CI migration owner must be SUPERUSER or BYPASSRLS for FORCE RLS maintenance.",
    );
  }
}

export async function assertMigrationOwnerCanDrainApplicationBackends(
  client: SqlClient,
  target: DeploymentTarget,
): Promise<void> {
  if (target === "ci") return;
  const capability = await client.query<{
    can_signal_backends: boolean;
    migration_owner: string;
  }>(`
      SELECT
          current_user::text AS migration_owner,
          pg_has_role(current_user, 'pg_signal_backend', 'USAGE')
              AS can_signal_backends
  `);
  if (
    capability.rows.length !== 1 ||
    capability.rows[0]?.can_signal_backends !== true
  ) {
    throw new Error(
      "The migration owner must have effective pg_signal_backend capability before the TEMP cutover can mutate the database.",
    );
  }
}

export async function readDeploymentRuntimeRoleAttributes(
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
            COALESCE(roles.rolconfig, ARRAY[]::text[]) AS role_config,
            (
                SELECT count(*)::integer
                FROM pg_catalog.pg_db_role_setting settings
                WHERE settings.setrole = roles.oid
                   OR (
                        settings.setrole = 0
                        AND settings.setdatabase IN (
                            0,
                            (
                                SELECT databases.oid
                                FROM pg_catalog.pg_database databases
                                WHERE databases.datname = current_database()
                            )
                        )
                   )
            ) AS database_role_setting_count,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'member_role', member_roles.rolname::text,
                        'granted_role', granted_roles.rolname::text,
                        'grantor_role', grantor_roles.rolname::text,
                        'admin_option', memberships.admin_option,
                        'inherit_option', memberships.inherit_option,
                        'set_option', memberships.set_option
                    )
                    ORDER BY
                        member_roles.rolname,
                        granted_roles.rolname,
                        grantor_roles.rolname
                )
                FROM pg_catalog.pg_auth_members memberships
                JOIN pg_catalog.pg_roles member_roles
                  ON member_roles.oid = memberships.member
                JOIN pg_catalog.pg_roles granted_roles
                  ON granted_roles.oid = memberships.roleid
                JOIN pg_catalog.pg_roles grantor_roles
                  ON grantor_roles.oid = memberships.grantor
                WHERE memberships.member = roles.oid
                   OR memberships.roleid = roles.oid
            ), '[]'::jsonb) AS role_memberships,
            (
                SELECT count(*)::integer
                FROM (
                    SELECT 1
                    FROM pg_catalog.pg_namespace objects
                    WHERE objects.nspowner = roles.oid
                      AND objects.nspname <> 'information_schema'
                      AND objects.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_class objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.relnamespace
                    WHERE objects.relowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_proc objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.pronamespace
                    WHERE objects.proowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_type objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.typnamespace
                    WHERE objects.typowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_collation objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.collnamespace
                    WHERE objects.collowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_conversion objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.connamespace
                    WHERE objects.conowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_operator objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.oprnamespace
                    WHERE objects.oprowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_opclass objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.opcnamespace
                    WHERE objects.opcowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_opfamily objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.opfnamespace
                    WHERE objects.opfowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_ts_config objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.cfgnamespace
                    WHERE objects.cfgowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_ts_dict objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.dictnamespace
                    WHERE objects.dictowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL
                    SELECT 1
                    FROM pg_catalog.pg_statistic_ext objects
                    JOIN pg_catalog.pg_namespace namespaces
                      ON namespaces.oid = objects.stxnamespace
                    WHERE objects.stxowner = roles.oid
                      AND namespaces.nspname <> 'information_schema'
                      AND namespaces.nspname !~ '^pg_'
                    UNION ALL SELECT 1 FROM pg_catalog.pg_extension objects WHERE objects.extowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_database objects WHERE objects.datdba = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_tablespace objects WHERE objects.spcowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_language objects WHERE objects.lanowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper objects WHERE objects.fdwowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_foreign_server objects WHERE objects.srvowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_event_trigger objects WHERE objects.evtowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_publication objects WHERE objects.pubowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_subscription objects WHERE objects.subowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_largeobject_metadata objects WHERE objects.lomowner = roles.oid
                    UNION ALL SELECT 1 FROM pg_catalog.pg_default_acl objects WHERE objects.defaclrole = roles.oid
                ) owned_objects
            ) AS owned_object_count,
            has_database_privilege(
                roles.oid,
                current_database(),
                'CREATE'
            ) AS can_create_in_current_database,
            has_database_privilege(
                roles.oid,
                current_database(),
                'TEMPORARY'
            ) AS can_create_temporary_tables,
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

export async function readDeploymentRuntimeRolePrivileges(
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
              AND classes.relkind IN ('r', 'p')
        ), unsupported_public_relations AS (
            SELECT classes.oid
            FROM pg_catalog.pg_class classes
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = classes.relnamespace
            WHERE namespaces.nspname = 'public'
              AND classes.relkind IN ('v', 'm', 'f')
        ), public_sequences AS (
            SELECT classes.oid, classes.relacl, classes.relowner
            FROM pg_catalog.pg_class classes
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = classes.relnamespace
            WHERE namespaces.nspname = 'public'
              AND classes.relkind = 'S'
        ), runtime_role AS (
            SELECT roles.oid
            FROM pg_catalog.pg_roles roles
            WHERE roles.rolname = $1
        ), application_roles AS (
            SELECT roles.oid
            FROM pg_catalog.pg_roles roles
            WHERE roles.rolname IN ('school_sis_runtime', 'school_sis_platform')
        ), migration_owner AS (
            SELECT roles.oid
            FROM pg_catalog.pg_roles roles
            WHERE roles.rolname = current_user
        ), effective_public_relation_privileges AS (
            SELECT
                relations.oid,
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM public_relations relations
            CROSS JOIN LATERAL aclexplode(COALESCE(
                relations.relacl,
                acldefault('r', relations.relowner)
            )) grants
            WHERE grants.grantee <> relations.relowner

            UNION ALL

            SELECT
                attributes.attrelid AS oid,
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_attribute attributes
            JOIN public_relations relations
              ON relations.oid = attributes.attrelid
            CROSS JOIN LATERAL aclexplode(attributes.attacl) grants
            WHERE attributes.attacl IS NOT NULL
              AND grants.grantee <> relations.relowner
        ), effective_public_sequence_privileges AS (
            SELECT
                sequences.oid,
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM public_sequences sequences
            CROSS JOIN LATERAL aclexplode(COALESCE(
                sequences.relacl,
                acldefault('s', sequences.relowner)
            )) grants
            WHERE grants.grantee <> sequences.relowner
        ), effective_ledger_privileges AS (
            SELECT
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_class ledger
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = ledger.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(
                ledger.relacl,
                acldefault('r', ledger.relowner)
            )) grants
            WHERE namespaces.nspname = 'drizzle'
              AND ledger.relname = '__drizzle_migrations'
              AND ledger.relkind IN ('r', 'p')
              AND grants.grantee <> ledger.relowner

            UNION ALL

            SELECT
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_attribute attributes
            JOIN pg_catalog.pg_class ledger ON ledger.oid = attributes.attrelid
            JOIN pg_catalog.pg_namespace namespaces
              ON namespaces.oid = ledger.relnamespace
            CROSS JOIN LATERAL aclexplode(attributes.attacl) grants
            WHERE namespaces.nspname = 'drizzle'
              AND ledger.relname = '__drizzle_migrations'
              AND ledger.relkind IN ('r', 'p')
              AND attributes.attacl IS NOT NULL
              AND grants.grantee <> ledger.relowner
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
                        'verified_tenant_id',
                        'has_tenant_context',
                        'tenant_context_enforcement_phase',
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
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM app_private_functions functions
            CROSS JOIN LATERAL aclexplode(COALESCE(
                functions.proacl,
                acldefault('f', functions.proowner)
            )) grants
            WHERE grants.grantee <> functions.proowner
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
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_default_acl defaults
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) grants
            WHERE defaults.defaclrole = (SELECT oid FROM migration_owner)
              AND defaults.defaclnamespace = (
                  SELECT namespaces.oid
                  FROM pg_catalog.pg_namespace namespaces
                  WHERE namespaces.nspname = 'public'
              )
              AND grants.grantee <> defaults.defaclrole
        ), actual_app_private_default_function_privileges AS (
            SELECT
                grants.grantee,
                grants.privilege_type::text AS privilege_type,
                grants.is_grantable
            FROM pg_catalog.pg_default_acl defaults
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) grants
            WHERE defaults.defaclrole = (SELECT oid FROM migration_owner)
              AND defaults.defaclobjtype = 'f'
              AND defaults.defaclnamespace = (
                  SELECT namespaces.oid
                  FROM pg_catalog.pg_namespace namespaces
                  WHERE namespaces.nspname = 'app_private'
              )
              AND grants.grantee <> defaults.defaclrole
        )
        SELECT
            COALESCE(has_schema_privilege($1, 'public', 'USAGE'), false)
                AS public_schema_usage,
            COALESCE(has_schema_privilege($1, 'drizzle', 'USAGE'), false)
                AS drizzle_schema_usage,
            COALESCE(has_schema_privilege($1, 'app_private', 'USAGE'), false)
                AS app_private_schema_usage,
            NOT EXISTS (SELECT 1 FROM unsupported_public_relations)
                AS no_unsupported_public_relations,
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
                WHERE NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = privileges.grantee
                      )
                   OR privileges.privilege_type NOT IN (
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
            NOT EXISTS (
                SELECT 1
                FROM effective_public_sequence_privileges privileges
                WHERE NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = privileges.grantee
                      )
                   OR privileges.privilege_type NOT IN ('USAGE', 'SELECT', 'UPDATE')
                   OR privileges.is_grantable
            ) AS public_sequences_only_runtime_privileges,
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
                WHERE NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = privileges.grantee
                      )
                   OR privileges.privilege_type <> 'SELECT'
                   OR privileges.is_grantable
            ) AS migration_ledger_only_select,
            (
                SELECT
                    count(*) = 5
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
                WHERE NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = privileges.grantee
                      )
                   OR NOT privileges.is_required
                   OR privileges.privilege_type <> 'EXECUTE'
                   OR privileges.is_grantable
            ) AS only_required_app_private_function_execute,
            (
                to_regclass('app_private.tenant_context_signing_keys') IS NOT NULL
                AND to_regclass('app_private.tenant_context_rollout_state') IS NOT NULL
                AND NOT has_table_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_signing_keys'),
                    'SELECT'
                )
                AND NOT has_table_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_signing_keys'),
                    'INSERT'
                )
                AND NOT has_table_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_signing_keys'),
                    'UPDATE'
                )
                AND NOT has_table_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_signing_keys'),
                    'DELETE'
                )
                AND NOT has_any_column_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_signing_keys'),
                    'SELECT,INSERT,UPDATE,REFERENCES'
                )
                AND NOT has_table_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_rollout_state'),
                    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
                )
                AND NOT has_any_column_privilege(
                    $1,
                    to_regclass('app_private.tenant_context_rollout_state'),
                    'SELECT,INSERT,UPDATE,REFERENCES'
                )
            ) AS tenant_context_private_tables_inaccessible,
            NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc functions
                JOIN pg_catalog.pg_namespace namespaces
                  ON namespaces.oid = functions.pronamespace
                WHERE functions.prosecdef
                  AND namespaces.nspname <> 'information_schema'
                  AND namespaces.nspname !~ '^pg_'
                  AND has_function_privilege($1, functions.oid, 'EXECUTE')
                  AND functions.oid NOT IN (
                      'app_private.current_tenant_id()'::regprocedure,
                      'app_private.verified_tenant_id()'::regprocedure,
                      'app_private.tenant_context_enforcement_phase()'::regprocedure
                  )
            ) AS no_unapproved_owner_security_definer_execute,
            NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_trigger triggers
                JOIN public_relations relations ON relations.oid = triggers.tgrelid
                JOIN pg_catalog.pg_proc functions ON functions.oid = triggers.tgfoid
                WHERE NOT triggers.tgisinternal
                  AND functions.prosecdef
            ) AS no_unapproved_security_definer_triggers,
            NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_rewrite rules
                JOIN public_relations relations ON relations.oid = rules.ev_class
                WHERE rules.rulename <> '_RETURN'
            ) AS no_unapproved_public_rewrite_rules,
            NOT EXISTS (
                SELECT 1
                FROM required_default_privileges required
                WHERE required.object_type = 'r'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM actual_default_privileges actual
                      WHERE actual.object_type = required.object_type
                        AND actual.grantee = (SELECT oid FROM runtime_role)
                        AND actual.privilege_type = required.privilege_type
                  )
            ) AS default_table_privileges,
            NOT EXISTS (
                SELECT 1
                FROM actual_default_privileges actual
                WHERE actual.object_type = 'r'
                  AND (
                      NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = actual.grantee
                      )
                      OR
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
                        AND actual.grantee = (SELECT oid FROM runtime_role)
                        AND actual.privilege_type = required.privilege_type
                  )
            )
            AND NOT EXISTS (
                SELECT 1
                FROM actual_default_privileges actual
                WHERE actual.object_type = 'S'
                  AND (
                      NOT EXISTS (
                          SELECT 1 FROM application_roles roles
                          WHERE roles.oid = actual.grantee
                      )
                      OR actual.privilege_type NOT IN ('USAGE', 'SELECT', 'UPDATE')
                      OR actual.is_grantable
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
  target: DeploymentTarget,
  runtimeRole: string,
  migrationOwner: string,
): Promise<void> {
  const quotedRuntimeRole = quotePostgresIdentifier(runtimeRole);
  const quotedMigrationOwner = quotePostgresIdentifier(migrationOwner);
  const database = await client.query<{ database_name: string }>(
    `SELECT current_database()::text AS database_name`,
  );
  const databaseName = database.rows[0]?.database_name;
  if (database.rows.length !== 1 || !databaseName) {
    throw new Error("Could not resolve the exact deployment database name.");
  }
  await client.query(
    `REVOKE TEMPORARY ON DATABASE ${quotePostgresIdentifier(databaseName)}
       FROM PUBLIC, ${quotedRuntimeRole}`,
  );

  await client.query(
    `GRANT USAGE ON SCHEMA public, drizzle, app_private TO ${quotedRuntimeRole}`,
  );
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC`);
  await client.query(
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`,
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
    `REVOKE ALL PRIVILEGES ON TABLE
         app_private.tenant_context_signing_keys,
         app_private.tenant_context_rollout_state
       FROM PUBLIC, ${quotedRuntimeRole}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION
          app_private.current_tenant_id(),
          app_private.verified_tenant_id(),
          app_private.has_tenant_context(),
          app_private.tenant_context_enforcement_phase(),
          app_private.rls_bypass()
       TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       REVOKE ALL ON TABLES FROM PUBLIC`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quotedRuntimeRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA public
       REVOKE ALL ON SEQUENCES FROM PUBLIC`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationOwner} IN SCHEMA app_private
       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${quotedRuntimeRole}`,
  );
  assertDeploymentRuntimeRoleIsSafe(
    target,
    runtimeRole,
    await readDeploymentRuntimeRoleAttributes(client, runtimeRole),
  );
  assertDeploymentRuntimeRolePrivileges(
    runtimeRole,
    await readDeploymentRuntimeRolePrivileges(client, runtimeRole),
  );
}

interface TenantContextKeyMatchRow {
  key_id: string;
  secret_matches: boolean;
}

interface TenantContextVerificationContractRow {
  all_helpers_owned_by_migration_role: boolean;
  invoker_helpers_exact: boolean;
  security_definer_helpers_exact: boolean;
}

interface TenantContextPreProvisionContractRow {
  pgcrypto_hmac_is_trusted_extension_member: boolean;
  key_storage_contract_exact: boolean;
  private_schema_contract_exact: boolean;
  rollout_storage_contract_exact: boolean;
}

export async function assertTenantContextPreProvisionContract(
  client: SqlClient,
): Promise<void> {
  const contract = await client.query<TenantContextPreProvisionContractRow>(`
      WITH key_relation AS (
          SELECT classes.*
          FROM pg_catalog.pg_class classes
          WHERE classes.oid = 'app_private.tenant_context_signing_keys'::regclass
      ), key_columns AS (
          SELECT
              attributes.attname,
              attributes.atttypid,
              attributes.attnotnull,
              attributes.attidentity,
              attributes.attgenerated,
              attributes.attacl,
              pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid) AS default_expression
          FROM pg_catalog.pg_attribute attributes
          LEFT JOIN pg_catalog.pg_attrdef defaults
            ON defaults.adrelid = attributes.attrelid
           AND defaults.adnum = attributes.attnum
          WHERE attributes.attrelid = 'app_private.tenant_context_signing_keys'::regclass
            AND attributes.attnum > 0
            AND NOT attributes.attisdropped
      ), key_constraints AS (
          SELECT
              constraints.conname,
              constraints.contype,
              constraints.conkey,
              constraints.condeferrable,
              constraints.condeferred,
              constraints.convalidated,
              constraints.connoinherit,
              pg_catalog.pg_get_constraintdef(constraints.oid, false) AS definition
          FROM pg_catalog.pg_constraint constraints
          WHERE constraints.conrelid = 'app_private.tenant_context_signing_keys'::regclass
            AND constraints.contype <> 'n'
      ), rollout_relation AS (
          SELECT classes.*
          FROM pg_catalog.pg_class classes
          WHERE classes.oid = 'app_private.tenant_context_rollout_state'::regclass
      ), rollout_columns AS (
          SELECT
              attributes.attname,
              attributes.atttypid,
              attributes.attnotnull,
              attributes.attidentity,
              attributes.attgenerated,
              attributes.attacl,
              pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid) AS default_expression
          FROM pg_catalog.pg_attribute attributes
          LEFT JOIN pg_catalog.pg_attrdef defaults
            ON defaults.adrelid = attributes.attrelid
           AND defaults.adnum = attributes.attnum
          WHERE attributes.attrelid = 'app_private.tenant_context_rollout_state'::regclass
            AND attributes.attnum > 0
            AND NOT attributes.attisdropped
      ), rollout_constraints AS (
          SELECT
              constraints.conname,
              constraints.contype,
              constraints.conkey,
              constraints.condeferrable,
              constraints.condeferred,
              constraints.convalidated,
              constraints.connoinherit,
              pg_catalog.pg_get_constraintdef(constraints.oid, false) AS definition
          FROM pg_catalog.pg_constraint constraints
          WHERE constraints.conrelid = 'app_private.tenant_context_rollout_state'::regclass
            AND constraints.contype <> 'n'
      ), pgcrypto_extension AS (
          SELECT extensions.oid, extensions.extowner
          FROM pg_catalog.pg_extension extensions
          JOIN pg_catalog.pg_namespace namespaces
            ON namespaces.oid = extensions.extnamespace
          WHERE extensions.extname = 'pgcrypto'
            AND namespaces.nspname = 'public'
      ), hmac_function AS (
          SELECT functions.*
          FROM pg_catalog.pg_proc functions
          WHERE functions.oid = 'public.hmac(bytea,bytea,text)'::regprocedure
      )
      SELECT
          (
              (SELECT count(*) FROM pgcrypto_extension) = 1
              AND (SELECT count(*) FROM hmac_function) = 1
              AND EXISTS (
                  SELECT 1
                  FROM hmac_function functions
                  JOIN pg_catalog.pg_language languages
                    ON languages.oid = functions.prolang
                  CROSS JOIN pgcrypto_extension extensions
                  JOIN pg_catalog.pg_depend dependencies
                    ON dependencies.classid = 'pg_catalog.pg_proc'::regclass
                   AND dependencies.objid = functions.oid
                   AND dependencies.refclassid = 'pg_catalog.pg_extension'::regclass
                   AND dependencies.refobjid = extensions.oid
                   AND dependencies.deptype = 'e'
                  WHERE functions.prorettype = 'bytea'::regtype
                    AND functions.proargtypes = ARRAY[
                        'bytea'::regtype::oid,
                        'bytea'::regtype::oid,
                        'text'::regtype::oid
                    ]::oidvector
                    AND functions.prosecdef = false
                    AND functions.provolatile = 'i'
                    AND languages.lanname = 'c'
                    AND functions.probin = '$libdir/pgcrypto'
                    AND functions.prosrc = 'pg_hmac'
              )
          ) AS pgcrypto_hmac_is_trusted_extension_member,
          (
              (SELECT count(*) FROM key_relation) = 1
              AND EXISTS (
                  SELECT 1
                  FROM key_relation relations
                  JOIN pg_catalog.pg_am access_methods
                    ON access_methods.oid = relations.relam
                  WHERE relations.relkind = 'r'
                    AND relations.relpersistence = 'p'
                    AND relations.relowner = (
                        SELECT roles.oid FROM pg_catalog.pg_roles roles WHERE roles.rolname = current_user
                    )
                    AND relations.relrowsecurity = false
                    AND relations.relforcerowsecurity = false
                    AND relations.reloptions IS NULL
                    AND access_methods.amname = 'heap'
                    AND NOT EXISTS (
                        SELECT 1
                        FROM aclexplode(COALESCE(relations.relacl, acldefault('r', relations.relowner))) grants
                        WHERE grants.grantee <> relations.relowner
                    )
              )
              AND (SELECT count(*) FROM key_columns) = 4
              AND EXISTS (
                  SELECT 1 FROM key_columns columns
                  WHERE columns.attname = 'audience'
                    AND columns.atttypid = 'text'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = ''
                    AND columns.attgenerated = ''
                    AND columns.attacl IS NULL
                    AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM key_columns columns
                  WHERE columns.attname = 'key_id'
                    AND columns.atttypid = 'text'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = ''
                    AND columns.attgenerated = ''
                    AND columns.attacl IS NULL
                    AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM key_columns columns
                  WHERE columns.attname = 'secret'
                    AND columns.atttypid = 'bytea'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = ''
                    AND columns.attgenerated = ''
                    AND columns.attacl IS NULL
                    AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM key_columns columns
                  WHERE columns.attname = 'created_at'
                    AND columns.atttypid = 'timestamp with time zone'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = ''
                    AND columns.attgenerated = ''
                    AND columns.attacl IS NULL
                    AND columns.default_expression = 'clock_timestamp()'
              )
              AND (SELECT count(*) FROM key_constraints) = 4
              AND EXISTS (
                  SELECT 1 FROM key_constraints constraints
                  WHERE constraints.conname = 'tenant_context_signing_keys_audience_format'
                    AND constraints.contype = 'c'
                    AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK ((audience ~ ''^[a-z0-9][a-z0-9:._-]{2,191}$''::text))'
              )
              AND EXISTS (
                  SELECT 1 FROM key_constraints constraints
                  WHERE constraints.contype = 'p'
                    AND constraints.conkey = ARRAY[
                        (SELECT attributes.attnum
                         FROM pg_catalog.pg_attribute attributes
                         WHERE attributes.attrelid = 'app_private.tenant_context_signing_keys'::regclass
                           AND attributes.attname = 'key_id')
                    ]::smallint[]
                    AND NOT constraints.condeferrable
                    AND NOT constraints.condeferred
                    AND constraints.convalidated
              )
              AND EXISTS (
                  SELECT 1 FROM key_constraints constraints
                  WHERE constraints.conname = 'tenant_context_signing_keys_key_id_format'
                    AND constraints.contype = 'c'
                    AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK ((key_id ~ ''^[a-z0-9][a-z0-9._-]{0,31}$''::text))'
              )
              AND EXISTS (
                  SELECT 1 FROM key_constraints constraints
                  WHERE constraints.conname = 'tenant_context_signing_keys_secret_length'
                    AND constraints.contype = 'c'
                    AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((octet_length(secret) >= 32) AND (octet_length(secret) <= 128)))'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_trigger triggers
                  WHERE triggers.tgrelid = 'app_private.tenant_context_signing_keys'::regclass
                    AND NOT triggers.tgisinternal
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_rewrite rules
                  WHERE rules.ev_class = 'app_private.tenant_context_signing_keys'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_policy policies
                  WHERE policies.polrelid = 'app_private.tenant_context_signing_keys'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication_rel publications
                  WHERE publications.prrelid = 'app_private.tenant_context_signing_keys'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication publications
                  WHERE publications.puballtables
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication_namespace publications
                  WHERE publications.pnnspid = 'app_private'::regnamespace
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_inherits inheritance
                  WHERE inheritance.inhrelid = 'app_private.tenant_context_signing_keys'::regclass
                     OR inheritance.inhparent = 'app_private.tenant_context_signing_keys'::regclass
              )
              AND (
                  SELECT count(*)
                  FROM pg_catalog.pg_index indexes
                  WHERE indexes.indrelid = 'app_private.tenant_context_signing_keys'::regclass
              ) = 1
          ) AS key_storage_contract_exact,
          EXISTS (
              SELECT 1
              FROM pg_catalog.pg_namespace namespaces
              WHERE namespaces.nspname = 'app_private'
                AND namespaces.nspowner = (
                    SELECT roles.oid FROM pg_catalog.pg_roles roles WHERE roles.rolname = current_user
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM aclexplode(COALESCE(namespaces.nspacl, acldefault('n', namespaces.nspowner))) grants
                    WHERE grants.grantee <> namespaces.nspowner
                      AND (
                          grants.privilege_type <> 'USAGE'
                          OR grants.is_grantable
                      )
                )
          ) AS private_schema_contract_exact,
          (
              (SELECT count(*) FROM rollout_relation) = 1
              AND EXISTS (
                  SELECT 1
                  FROM rollout_relation relations
                  JOIN pg_catalog.pg_am access_methods ON access_methods.oid = relations.relam
                  WHERE relations.relkind = 'r'
                    AND relations.relpersistence = 'p'
                    AND relations.relowner = (
                        SELECT roles.oid FROM pg_catalog.pg_roles roles WHERE roles.rolname = current_user
                    )
                    AND NOT relations.relrowsecurity
                    AND NOT relations.relforcerowsecurity
                    AND relations.reloptions IS NULL
                    AND access_methods.amname = 'heap'
                    AND NOT EXISTS (
                        SELECT 1
                        FROM aclexplode(COALESCE(relations.relacl, acldefault('r', relations.relowner))) grants
                        WHERE grants.grantee <> relations.relowner
                    )
              )
              AND (SELECT count(*) FROM rollout_columns) = 9
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'singleton'
                    AND columns.atttypid = 'boolean'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression = 'true'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'enforcement_phase'
                    AND columns.atttypid = 'smallint'::regtype
                    AND columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression = '1'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'signed_runtime_sha'
                    AND columns.atttypid = 'text'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'promoted_key_id'
                    AND columns.atttypid = 'text'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'promoted_audience'
                    AND columns.atttypid = 'text'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'promoted_deployment_id'
                    AND columns.atttypid = 'text'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'promoted_at'
                    AND columns.atttypid = 'timestamp with time zone'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'temp_revoked_at'
                    AND columns.atttypid = 'timestamp with time zone'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_columns columns
                  WHERE columns.attname = 'temp_drain_completed_at'
                    AND columns.atttypid = 'timestamp with time zone'::regtype
                    AND NOT columns.attnotnull
                    AND columns.attidentity = '' AND columns.attgenerated = ''
                    AND columns.attacl IS NULL AND columns.default_expression IS NULL
              )
              AND (SELECT count(*) FROM rollout_constraints) = 9
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.contype = 'p'
                    AND constraints.conkey = ARRAY[
                        (SELECT attributes.attnum
                         FROM pg_catalog.pg_attribute attributes
                         WHERE attributes.attrelid = 'app_private.tenant_context_rollout_state'::regclass
                           AND attributes.attname = 'singleton')
                    ]::smallint[]
                    AND NOT constraints.condeferrable
                    AND NOT constraints.condeferred
                    AND constraints.convalidated
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_singleton'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition = 'CHECK (singleton)'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_phase'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK ((enforcement_phase = ANY (ARRAY[1, 2])))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_sha'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((signed_runtime_sha IS NULL) OR (signed_runtime_sha ~ ''^[0-9a-f]{40}$''::text)))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_key_id'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((promoted_key_id IS NULL) OR (promoted_key_id ~ ''^[a-z0-9][a-z0-9._-]{0,31}$''::text)))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_audience'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((promoted_audience IS NULL) OR (promoted_audience ~ ''^[a-z0-9][a-z0-9:._-]{2,191}$''::text)))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_deployment_id'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((promoted_deployment_id IS NULL) OR (promoted_deployment_id ~ ''^dpl_[A-Za-z0-9]+$''::text)))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_temp_drain_order'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK (((temp_drain_completed_at IS NULL) OR (temp_revoked_at IS NOT NULL)))'
              )
              AND EXISTS (
                  SELECT 1 FROM rollout_constraints constraints
                  WHERE constraints.conname = 'tenant_context_rollout_state_promotion_complete'
                    AND constraints.contype = 'c' AND constraints.convalidated
                    AND NOT constraints.connoinherit
                    AND constraints.definition =
                        'CHECK ((((signed_runtime_sha IS NULL) AND (promoted_key_id IS NULL) AND (promoted_audience IS NULL) AND (promoted_deployment_id IS NULL) AND (promoted_at IS NULL)) OR ((signed_runtime_sha IS NOT NULL) AND (promoted_key_id IS NOT NULL) AND (promoted_audience IS NOT NULL) AND (promoted_deployment_id IS NOT NULL) AND (promoted_at IS NOT NULL))))'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_trigger triggers
                  WHERE triggers.tgrelid = 'app_private.tenant_context_rollout_state'::regclass
                    AND NOT triggers.tgisinternal
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_rewrite rules
                  WHERE rules.ev_class = 'app_private.tenant_context_rollout_state'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_policy policies
                  WHERE policies.polrelid = 'app_private.tenant_context_rollout_state'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication_rel publications
                  WHERE publications.prrelid = 'app_private.tenant_context_rollout_state'::regclass
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication publications
                  WHERE publications.puballtables
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_publication_namespace publications
                  WHERE publications.pnnspid = 'app_private'::regnamespace
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_inherits inheritance
                  WHERE inheritance.inhrelid = 'app_private.tenant_context_rollout_state'::regclass
                     OR inheritance.inhparent = 'app_private.tenant_context_rollout_state'::regclass
              )
              AND (
                  SELECT count(*) FROM pg_catalog.pg_index indexes
                  WHERE indexes.indrelid = 'app_private.tenant_context_rollout_state'::regclass
              ) = 1
          ) AS rollout_storage_contract_exact
  `);
  const row = contract.rows[0];
  if (
    contract.rows.length !== 1 ||
    row?.pgcrypto_hmac_is_trusted_extension_member !== true ||
    row.key_storage_contract_exact !== true ||
    row.private_schema_contract_exact !== true ||
    row.rollout_storage_contract_exact !== true
  ) {
    const failedContracts = row
      ? Object.entries(row)
          .filter(([, value]) => value !== true)
          .map(([name]) => name)
          .join(", ")
      : "missing_contract_row";
    throw new Error(
      `Tenant-context key storage or the pgcrypto HMAC dependency is malformed (${failedContracts}); refusing to handle key material.`,
    );
  }
}

export async function provisionTenantContextSigningKeys(
  client: SqlClient,
  configuration: TenantContextSigningKeyConfiguration,
): Promise<void> {
  const expectedKeys = [
    configuration.current,
    ...(configuration.previous ? [configuration.previous] : []),
  ];
  const expectedIds = expectedKeys.map((key) => key.keyId).sort();

  await client.query(
    `LOCK TABLE
         app_private.tenant_context_signing_keys,
         app_private.tenant_context_rollout_state
       IN ACCESS EXCLUSIVE MODE`,
  );
  await assertTenantContextPreProvisionContract(client);
  await client.query(
    `INSERT INTO app_private.tenant_context_rollout_state
         (singleton, enforcement_phase)
     VALUES (true, 1)
     ON CONFLICT (singleton) DO NOTHING`,
  );
  for (const key of expectedKeys) {
    await client.query(
      `INSERT INTO app_private.tenant_context_signing_keys (key_id, audience, secret)
       VALUES ($1, $2, convert_to($3, 'UTF8'))
       ON CONFLICT (key_id) DO NOTHING`,
      [key.keyId, configuration.audience, key.secret],
    );
    // Compare HMACs instead of the raw key bytes so even a driver/debugger
    // inspecting returned rows cannot receive verification-key material.
    const storedMatches = await client.query<TenantContextKeyMatchRow>(
      `SELECT
          keys.key_id,
          (
              public.hmac(
                  convert_to('school-sis:key-provisioning:v1', 'UTF8'),
                  keys.secret,
                  'sha256'
              ) =
              public.hmac(
                  convert_to('school-sis:key-provisioning:v1', 'UTF8'),
                  convert_to($3, 'UTF8'),
                  'sha256'
              )
          ) AS secret_matches
       FROM app_private.tenant_context_signing_keys keys
       WHERE keys.key_id = $1
         AND keys.audience = $2`,
      [key.keyId, configuration.audience, key.secret],
    );
    if (
      storedMatches.rows.length !== 1 ||
      storedMatches.rows[0]?.secret_matches !== true
    ) {
      throw new Error(
        `Tenant-context key ${key.keyId} already exists with different key material; rotate to a new key ID.`,
      );
    }
  }

  const currentRows = await client.query<{ audience: string; key_id: string }>(
    `SELECT keys.key_id, keys.audience
     FROM app_private.tenant_context_signing_keys keys
     ORDER BY keys.key_id`,
  );
  const unexpectedIds = currentRows.rows
    .filter(
      (row) =>
        row.audience !== configuration.audience ||
        !expectedIds.includes(row.key_id),
    )
    .map((row) => row.key_id);
  if (unexpectedIds.length > 0 && !configuration.retirePrevious) {
    throw new Error(
      `Database still accepts tenant-context key(s) ${unexpectedIds.join(", ")}; preserve them as the previous key or explicitly acknowledge retirement with ${TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_ENV}=true.`,
    );
  }
  if (configuration.retirePrevious && unexpectedIds.length === 0) {
    throw new Error(
      `${TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_ENV}=true was set but there is no previous key to retire.`,
    );
  }
  if (unexpectedIds.length > 0) {
    if (configuration.retirePrevious) {
      if (!/^[0-9a-f]{40}$/.test(configuration.releaseSha || "")) {
        throw new Error(
          "Tenant-context key retirement requires the full lowercase GIT_COMMIT_SHA.",
        );
      }
      const promotion = await client.query<{
        promoted_audience: string | null;
        promoted_at: Date | string | null;
        promoted_deployment_id: string | null;
        promoted_key_id: string | null;
        signed_runtime_sha: string | null;
      }>(
        `SELECT
            state.promoted_key_id,
            state.promoted_audience,
            state.promoted_deployment_id,
            state.signed_runtime_sha,
            state.promoted_at
         FROM app_private.tenant_context_rollout_state state
         WHERE state.singleton = true
         FOR UPDATE`,
      );
      const evidence = promotion.rows[0];
      if (
        promotion.rows.length !== 1 ||
        evidence?.promoted_key_id !== configuration.current.keyId ||
        evidence.promoted_audience !== configuration.audience ||
        !evidence.promoted_deployment_id ||
        !/^dpl_[A-Za-z0-9]+$/.test(evidence.promoted_deployment_id) ||
        evidence.promoted_deployment_id !==
          configuration.currentProductionDeploymentId ||
        !evidence.signed_runtime_sha ||
        !/^[0-9a-f]{40}$/.test(evidence.signed_runtime_sha) ||
        evidence.signed_runtime_sha === configuration.releaseSha ||
        !evidence.promoted_at
      ) {
        throw new Error(
          "Tenant-context key retirement requires an earlier verified production promotion using the current key ID.",
        );
      }
    }
    await client.query(
      `DELETE FROM app_private.tenant_context_signing_keys
       WHERE NOT (key_id = ANY($1::text[]))`,
      [expectedIds],
    );
  }

  const finalRows = await client.query<{ audience: string; key_id: string }>(
    `SELECT keys.key_id, keys.audience
     FROM app_private.tenant_context_signing_keys keys
     ORDER BY keys.key_id`,
  );
  if (
    finalRows.rows.length !== expectedIds.length ||
    finalRows.rows.some(
      (row, index) =>
        row.key_id !== expectedIds[index] ||
        row.audience !== configuration.audience,
    )
  ) {
    throw new Error(
      "Tenant-context verification-key reconciliation did not reach the exact expected key set.",
    );
  }

  await assertTenantContextPreProvisionContract(client);
  const contract = await client.query<TenantContextVerificationContractRow>(`
      SELECT
          (
              SELECT count(*) = 7
                 AND bool_and(functions.proowner = (
                     SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user
                 ))
              FROM pg_catalog.pg_proc functions
              WHERE functions.oid IN (
                  'app_private.constant_time_equal_32(bytea,bytea)'::regprocedure,
                  'app_private.verified_tenant_id()'::regprocedure,
                  'app_private.current_tenant_id()'::regprocedure,
                  'app_private.has_tenant_context()'::regprocedure,
                  'app_private.tenant_context_enforcement_phase()'::regprocedure,
                  'app_private.rls_bypass()'::regprocedure,
                  'app_private.table_exists(text)'::regprocedure
              )
          ) AS all_helpers_owned_by_migration_role,
          (
              SELECT count(*) = 5
                 AND bool_and(NOT functions.prosecdef)
              FROM pg_catalog.pg_proc functions
              WHERE functions.oid IN (
                  'app_private.constant_time_equal_32(bytea,bytea)'::regprocedure,
                  'app_private.current_tenant_id()'::regprocedure,
                  'app_private.has_tenant_context()'::regprocedure,
                  'app_private.rls_bypass()'::regprocedure,
                  'app_private.table_exists(text)'::regprocedure
              )
          ) AS invoker_helpers_exact,
          (
              SELECT count(*) = 2
                 AND bool_and(
                     functions.prosecdef
                     AND functions.proconfig =
                         ARRAY['search_path=pg_catalog, pg_temp']::text[]
                 )
              FROM pg_catalog.pg_proc functions
              WHERE functions.oid IN (
                  'app_private.verified_tenant_id()'::regprocedure,
                  'app_private.tenant_context_enforcement_phase()'::regprocedure
              )
          ) AS security_definer_helpers_exact
  `);
  const verified = contract.rows[0];
  if (
    contract.rows.length !== 1 ||
    !verified ||
    Object.values(verified).some((value) => value !== true)
  ) {
    throw new Error(
      "Tenant-context database verifier ownership, ACL, pgcrypto schema, or SECURITY DEFINER contract is unsafe.",
    );
  }
}

interface TenantContextRolloutStateRow {
  enforcement_phase: number;
  promoted_audience: string | null;
  promoted_at: Date | string | null;
  promoted_deployment_id: string | null;
  promoted_key_id: string | null;
  signed_runtime_sha: string | null;
}

export async function reconcileTenantContextEnforcementPhase(
  client: SqlClient,
  target: DeploymentTarget,
  environment: DeploymentEnvironment,
): Promise<1 | 2> {
  const desiredPhase =
    target === "production" ? PRODUCTION_TENANT_CONTEXT_ENFORCEMENT_PHASE : 2;
  const state = await client.query<TenantContextRolloutStateRow>(
    `SELECT
        state.enforcement_phase,
        state.promoted_key_id,
        state.promoted_audience,
        state.promoted_deployment_id,
        state.signed_runtime_sha,
        state.promoted_at
     FROM app_private.tenant_context_rollout_state state
     WHERE state.singleton = true
     FOR UPDATE`,
  );
  if (
    state.rows.length !== 1 ||
    !state.rows[0] ||
    ![1, 2].includes(state.rows[0].enforcement_phase)
  ) {
    throw new Error(
      "Tenant-context rollout state must contain exactly one valid singleton row.",
    );
  }
  const current = state.rows[0];
  if (current.enforcement_phase === 2) return 2;
  if (desiredPhase === 1) return 1;

  if (target === "production") {
    const releaseSha = nonBlank(environment.GIT_COMMIT_SHA) || "";
    const configuredKeyId = nonBlank(environment.TENANT_CONTEXT_SIGNING_KEY_ID);
    const configuredAudience = nonBlank(environment.TENANT_CONTEXT_AUDIENCE);
    const currentProductionDeploymentId = nonBlank(
      environment.CURRENT_PRODUCTION_DEPLOYMENT_ID,
    );
    if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
      throw new Error(
        "Strict tenant-context enforcement requires the full lowercase GIT_COMMIT_SHA.",
      );
    }
    if (
      !current.signed_runtime_sha ||
      !/^[0-9a-f]{40}$/.test(current.signed_runtime_sha) ||
      !current.promoted_at ||
      !current.promoted_deployment_id ||
      !/^dpl_[A-Za-z0-9]+$/.test(current.promoted_deployment_id) ||
      current.promoted_deployment_id !== currentProductionDeploymentId ||
      !current.promoted_key_id ||
      !current.promoted_audience ||
      current.promoted_key_id !== configuredKeyId ||
      current.promoted_audience !== configuredAudience ||
      current.signed_runtime_sha === releaseSha
    ) {
      throw new Error(
        "Phase 2 requires a signing runtime from an earlier commit to have been promoted and recorded by the production workflow.",
      );
    }
  }

  const updated = await client.query<{ enforcement_phase: number }>(
    `UPDATE app_private.tenant_context_rollout_state
     SET enforcement_phase = 2
     WHERE singleton = true AND enforcement_phase = 1
     RETURNING enforcement_phase`,
  );
  if (updated.rows.length !== 1 || updated.rows[0]?.enforcement_phase !== 2) {
    throw new Error(
      "Tenant-context enforcement phase did not advance atomically to strict mode.",
    );
  }
  return 2;
}

async function configureMigrationSession(client: SqlClient): Promise<void> {
  await client.query(
    `SELECT
            set_config('statement_timeout', '900000', false),
            set_config('lock_timeout', '30000', false),
            set_config('idle_in_transaction_session_timeout', '900000', false)`,
  );
}

type AuthenticationSaslMessage = { mechanisms?: unknown };
type ObservablePgConnection = {
  on(
    event: "authenticationSASL",
    listener: (message: AuthenticationSaslMessage) => void,
  ): unknown;
};

/**
 * Install this probe before connect(), then invoke the returned assertion
 * immediately after authentication and before issuing any SQL. Enabling channel
 * binding alone is not proof that the server offered SCRAM-SHA-256-PLUS.
 */
export function installRequiredChannelBindingProbe(client: Client): () => void {
  const internals = client as unknown as {
    connection?: Partial<ObservablePgConnection>;
    enableChannelBinding?: unknown;
  };
  if (
    internals.enableChannelBinding !== true ||
    typeof internals.connection?.on !== "function"
  ) {
    throw new Error(
      "The PostgreSQL driver cannot prove required channel-binding negotiation.",
    );
  }
  let plusWasOffered = false;
  internals.connection.on("authenticationSASL", (message) => {
    plusWasOffered =
      Array.isArray(message.mechanisms) &&
      message.mechanisms.includes("SCRAM-SHA-256-PLUS");
  });
  return () => {
    if (!plusWasOffered) {
      throw new Error(
        "PostgreSQL did not negotiate the required SCRAM-SHA-256-PLUS channel binding.",
      );
    }
  };
}

export async function drainPreTemporaryPrivilegeBackends(
  client: SqlClient,
  applicationRoles: readonly string[],
  cutoffValue: string,
): Promise<number> {
  const uniqueRoles = [...new Set(applicationRoles)];
  if (
    uniqueRoles.length !== 2 ||
    uniqueRoles.some((role) => !SAFE_POSTGRES_IDENTIFIER_PATTERN.test(role))
  ) {
    throw new Error(
      "TEMP cutover drain requires the two exact validated application roles.",
    );
  }
  if (!cutoffValue || !/^\d{4}-\d{2}-\d{2}/u.test(cutoffValue)) {
    throw new Error(
      "TEMP cutover requires a persisted database-clock boundary.",
    );
  }
  const terminated = await client.query<{
    pid: number;
    terminated: boolean;
  }>(
    `WITH targets AS MATERIALIZED (
        SELECT activity.pid
        FROM pg_catalog.pg_stat_activity activity
        WHERE activity.datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
          AND activity.usename = ANY($1::text[])
          AND activity.backend_start <= $2::timestamptz
          AND activity.pid <> pg_backend_pid()
     )
     SELECT targets.pid, pg_catalog.pg_terminate_backend(targets.pid) AS terminated
     FROM targets
     ORDER BY targets.pid`,
    [uniqueRoles, cutoffValue],
  );
  if (terminated.rows.some((row) => row.terminated !== true)) {
    throw new Error(
      "Could not terminate every pre-cutover application backend after revoking TEMPORARY.",
    );
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remaining = await client.query<{ remaining: number }>(
      `SELECT count(*)::integer AS remaining
       FROM pg_catalog.pg_stat_activity activity
       WHERE activity.datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
         AND activity.usename = ANY($1::text[])
         AND activity.backend_start <= $2::timestamptz
         AND activity.pid <> pg_backend_pid()`,
      [uniqueRoles, cutoffValue],
    );
    if (remaining.rows.length !== 1 || !remaining.rows[0]) {
      throw new Error("Could not verify the TEMP cutover backend drain.");
    }
    if (remaining.rows[0].remaining === 0) return terminated.rows.length;
    await sleepFor(250);
  }
  throw new Error(
    "Pre-cutover application backends remain after revoking TEMPORARY.",
  );
}

export async function completeTemporaryPrivilegeCutover(
  client: SqlClient,
  target: DeploymentTarget,
  applicationRoles: readonly string[],
): Promise<number> {
  if (target === "ci") return 0;
  const state = await client.query<{
    temp_drain_completed_at: string | null;
    temp_revoked_at: string;
  }>(
    `UPDATE app_private.tenant_context_rollout_state
     SET temp_revoked_at = COALESCE(temp_revoked_at, clock_timestamp())
     WHERE singleton = true
     RETURNING
         temp_revoked_at::text AS temp_revoked_at,
         temp_drain_completed_at::text AS temp_drain_completed_at`,
  );
  const row = state.rows[0];
  if (state.rows.length !== 1 || !row?.temp_revoked_at) {
    throw new Error("Could not persist the TEMP privilege cutover boundary.");
  }
  if (row.temp_drain_completed_at) return 0;

  const drained = await drainPreTemporaryPrivilegeBackends(
    client,
    applicationRoles,
    row.temp_revoked_at,
  );
  const completed = await client.query<{ temp_drain_completed_at: string }>(
    `UPDATE app_private.tenant_context_rollout_state
     SET temp_drain_completed_at = clock_timestamp()
     WHERE singleton = true
       AND temp_revoked_at = $1::timestamptz
       AND temp_drain_completed_at IS NULL
     RETURNING temp_drain_completed_at::text AS temp_drain_completed_at`,
    [row.temp_revoked_at],
  );
  if (
    completed.rows.length !== 1 ||
    !completed.rows[0]?.temp_drain_completed_at
  ) {
    throw new Error(
      "Could not atomically record the completed TEMP backend drain.",
    );
  }
  return drained;
}

export async function runDeploymentMigrations(
  options: RunDeploymentMigrationsOptions,
): Promise<MigrationRunResult> {
  const environment = options.environment ?? process.env;
  const logger = options.logger ?? console;
  const connection = resolveDeploymentConnection(options.target, environment);
  const tenantContextSigningKeys = resolveTenantContextSigningKeyConfiguration(
    options.target,
    environment,
    isLocalHostname(connection.hostname),
  );
  const runtimeRole = resolveDeploymentRuntimeRole(options.target, environment);
  const platformRole = resolveDeploymentPlatformRole(
    options.target,
    environment,
  );
  assertDeploymentApplicationRolesAreDistinct(runtimeRole, platformRole);
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
    enableChannelBinding: true,
  });

  let result: MigrationRunResult | undefined;
  let runFailed = false;
  let runError: unknown;
  try {
    const assertRequiredChannelBinding = isLocalHostname(connection.hostname)
      ? undefined
      : installRequiredChannelBindingProbe(client);
    await client.connect();
    assertRequiredChannelBinding?.();
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
        await assertMigrationOwnerCanMaintainForcedRls(client, options.target);
        await assertMigrationOwnerCanDrainApplicationBackends(
          client,
          options.target,
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
            true,
          );
        }
        if (platformRole) {
          assertDeploymentRuntimeRoleIsSafe(
            options.target,
            platformRole,
            await readDeploymentRuntimeRoleAttributes(client, platformRole),
            true,
          );
        }

        await applyDeploymentSchemaTransaction(
          client,
          deploymentMigrations,
          appliedBefore,
          tenantRlsSql,
          async () => {
            await provisionTenantContextSigningKeys(
              client,
              tenantContextSigningKeys,
            );
            const tenantContextPhase =
              await reconcileTenantContextEnforcementPhase(
                client,
                options.target,
                environment,
              );
            const postflight = await readMigrationDatabaseState(client);
            assertMigrationLedger(expectedMigrations, postflight, "postflight");
            assertRlsCoverage(await readRlsCoverage(client));
            if (runtimeRole) {
              const runtimeRoleAttributes = assertDeploymentRuntimeRoleIsSafe(
                options.target,
                runtimeRole,
                await readDeploymentRuntimeRoleAttributes(client, runtimeRole),
                true,
              );
              await grantAndVerifyDeploymentRuntimeRole(
                client,
                options.target,
                runtimeRole,
                runtimeRoleAttributes.migration_owner,
              );
            }
            if (platformRole) {
              const platformRoleAttributes = assertDeploymentRuntimeRoleIsSafe(
                options.target,
                platformRole,
                await readDeploymentRuntimeRoleAttributes(client, platformRole),
                true,
              );
              await grantAndVerifyDeploymentRuntimeRole(
                client,
                options.target,
                platformRole,
                platformRoleAttributes.migration_owner,
              );
            }
            logger.info(
              `Tenant-context verifier is provisioned at enforcement phase ${tenantContextPhase}.`,
            );
          },
        );
        logger.info(
          `Atomic migration commit verified ${expectedMigrations.length} ledger entries, tenant RLS coverage${runtimeRole && platformRole ? ", and tenant/platform runtime-role privileges" : ""}.`,
        );
        if (options.target !== "ci") {
          if (!runtimeRole || !platformRole) {
            throw new Error(
              "The TEMP cutover requires both exact application roles.",
            );
          }
          const drained = await completeTemporaryPrivilegeCutover(
            client,
            options.target,
            [runtimeRole, platformRole],
          );
          logger.info(
            `Application TEMP cutover is complete; drained ${drained} pre-revocation backend(s) on this run.`,
          );
        }

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
