import { AsyncLocalStorage } from "async_hooks";
import { createHmac, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { getLimit } from "@/lib/config/limits";
import { resolveDatabaseConnectionOptions } from "./ssl";
import { createSqlTag } from "./sql";
import {
  assertRlsBypassJustification,
  type RlsBypassJustification,
} from "./rls-bypass";
import {
  resolveTenantContextSigningEnvironment,
  type TenantContextSigningEnvironment,
} from "./tenant-context-config";

export { resolveDatabaseConnectionOptions, resolveDatabaseSsl } from "./ssl";
export {
  RLS_BYPASS_JUSTIFICATIONS,
  type RlsBypassJustification,
} from "./rls-bypass";

/**
 * Database connection — uses native pg.Pool
 *
 * SECURITY:
 * - Crashes if DATABASE_URL is missing
 * - Enforces SSL in production
 * - Provides per-request tenant context for RLS enforcement
 */

const isBuildPhase =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE === "phase-production-build";

if (
  isBuildPhase &&
  process.env.VERCEL === "1" &&
  process.env.DEPLOYMENT_CONTRACT_VALIDATED !== "1"
) {
  throw new Error(
    "Vercel builds must run through the repository deployment contract. " +
      "Use the configured vercel-build command.",
  );
}

function normalizeRuntimeDatabaseUrl(value: string, variable: string): string {
  // Local-first: no cloud SSL is enforced. Just validate the shape.
  if (!value || isBuildPhase) return value;
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error(`${variable} must use postgres:// or postgresql://.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("postgres://")) throw err;
    throw new Error(`${variable} must be a valid Postgres URL.`);
  }
  return value;
}

let connectionString = normalizeRuntimeDatabaseUrl(
  process.env.DATABASE_URL || "",
  "DATABASE_URL",
);
let platformConnectionString = normalizeRuntimeDatabaseUrl(
  process.env.PLATFORM_DATABASE_URL || "",
  "PLATFORM_DATABASE_URL",
);

if (isBuildPhase) {
  connectionString = "postgresql://dummy:dummy@dummy:5432/dummy";
  platformConnectionString = connectionString;
} else if (connectionString && process.env.DATABASE_URL !== connectionString) {
  process.env.DATABASE_URL = connectionString;
}

if (!isBuildPhase && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required. " +
      "Set it in your .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require",
  );
}

if (!isBuildPhase && !platformConnectionString) {
  const runtime = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (localHosts.has(runtime.hostname.toLowerCase())) {
    // Local development and CI commonly use one owner connection. Remote
    // deployments must provide a separate, least-privilege platform role.
    platformConnectionString = connectionString;
  } else {
    throw new Error(
      "PLATFORM_DATABASE_URL environment variable is required for remote runtimes.",
    );
  }
}

declare global {
  var pgPool: Pool | undefined;
  var pgPlatformPool: Pool | undefined;
  var drizzleDb: any | undefined;
  var pgPoolContextPatched: boolean | undefined;
  var dbRlsContextStorage: AsyncLocalStorage<DbRlsContext> | undefined;
  var dbRlsContextResolver: DbRlsContextResolver | undefined;
}

type DbRlsContext =
  | { tenantId: string; bypassRls?: false }
  | {
      tenantId?: undefined;
      bypassRls: true;
      justification: RlsBypassJustification;
    };

export type DbRlsContextResolver = () =>
  | DbRlsContext
  | undefined
  | Promise<DbRlsContext | undefined>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_CONTEXT_KEY_ID_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const TENANT_CONTEXT_AUDIENCE_RE = /^[a-z0-9][a-z0-9:._-]{2,191}$/;
const TENANT_CONTEXT_SECRET_RE = /^[A-Za-z0-9_-]{43,128}$/;
const TENANT_CONTEXT_NONCE_RE = /^[0-9a-f]{32}$/;
const TENANT_CONTEXT_TRANSACTION_ID_RE = /^[1-9][0-9]{0,19}$/;
const TENANT_CONTEXT_DOMAIN = "school-sis:tenant-context:v1";
const TENANT_CONTEXT_TTL_SECONDS = 300;
/**
 * Both of these MUST live on `globalThis`, for the same reason `pgPool` and
 * `drizzleDb` below do: Next.js loads this module more than once per process.
 * `instrumentation.ts` runs in its own module graph, so a plain module-level
 * `let` set by `registerDbRlsContextResolver` is invisible to the instance the
 * page and server-action bundles import.
 *
 * When that happened, `resolvedContext()` returned undefined for every request,
 * no tenant context was ever applied, and FORCE RLS answered every tenant-scoped
 * read with zero rows. Pages still returned HTTP 200 — they rendered their empty
 * states — so nothing failed loudly: `/students` showed "No students found",
 * `/invoices` "No invoices match this view", `/executive` ₹0 across the board.
 * `e2e/route-smoke.ts` is the gate that catches a regression here.
 */
const dbContext: AsyncLocalStorage<DbRlsContext> =
  globalThis.dbRlsContextStorage ?? new AsyncLocalStorage<DbRlsContext>();
globalThis.dbRlsContextStorage = dbContext;

function assertTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) {
    throw new Error("Invalid tenant context.");
  }
}

interface SignedTenantContext {
  audience: string;
  expiresAt: string;
  keyId: string;
  nonce: string;
  signature: string;
  tenantId: string;
  transactionId: string;
}

/**
 * Signs the complete transaction-local tenant context. The database stores a
 * protected copy of the same key and accepts the tenant UUID only after
 * verifying this HMAC. PostgreSQL login credentials alone therefore cannot
 * forge a tenant by setting custom GUCs.
 */
export function signTenantContext(
  tenantId: string,
  environment: TenantContextSigningEnvironment = resolveTenantContextSigningEnvironment(
    process.env,
  ),
  options: { nowMs?: number; nonce?: string; transactionId: string },
): SignedTenantContext {
  assertTenantId(tenantId);
  const canonicalTenantId = tenantId.toLowerCase();
  const audience = environment.TENANT_CONTEXT_AUDIENCE?.trim() || "";
  const keyId = environment.TENANT_CONTEXT_SIGNING_KEY_ID?.trim() || "";
  const secret = environment.TENANT_CONTEXT_SIGNING_SECRET || "";
  if (!TENANT_CONTEXT_KEY_ID_RE.test(keyId)) {
    throw new Error(
      "TENANT_CONTEXT_SIGNING_KEY_ID must be a lowercase rotation identifier.",
    );
  }
  if (!TENANT_CONTEXT_AUDIENCE_RE.test(audience)) {
    throw new Error(
      "TENANT_CONTEXT_AUDIENCE must be a lowercase deployment-specific audience.",
    );
  }
  if (!TENANT_CONTEXT_SECRET_RE.test(secret)) {
    throw new Error(
      "TENANT_CONTEXT_SIGNING_SECRET must be a 43-128 character base64url secret.",
    );
  }

  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Tenant context signing clock is invalid.");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!TENANT_CONTEXT_NONCE_RE.test(nonce)) {
    throw new Error("Tenant context nonce must be 16 lowercase-hex bytes.");
  }
  const transactionId = options.transactionId;
  if (!TENANT_CONTEXT_TRANSACTION_ID_RE.test(transactionId)) {
    throw new Error("Tenant context transaction ID is invalid.");
  }
  const expiresAt = String(
    Math.floor(nowMs / 1000) + TENANT_CONTEXT_TTL_SECONDS,
  );
  const payload = [
    TENANT_CONTEXT_DOMAIN,
    audience,
    keyId,
    transactionId,
    canonicalTenantId,
    expiresAt,
    nonce,
  ].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    audience,
    expiresAt,
    keyId,
    nonce,
    signature,
    tenantId: canonicalTenantId,
    transactionId,
  };
}

function currentContext(): DbRlsContext | undefined {
  return dbContext.getStore();
}

async function resolvedContext(): Promise<DbRlsContext | undefined> {
  const scoped = currentContext();
  if (scoped) return scoped;
  const resolver = globalThis.dbRlsContextResolver;
  if (!resolver) return undefined;

  const resolved = await resolver();
  if (!resolved) return undefined;
  if (resolved.bypassRls) {
    assertRlsBypassJustification(resolved.justification);
  } else {
    assertTenantId(resolved.tenantId);
  }
  return resolved;
}

/**
 * Registers the web runtime's request-session resolver. AsyncLocalStorage scopes
 * remain authoritative for jobs, integrations, and explicitly-scoped work; this
 * resolver covers the normal `await requireAuth(); pool.query(...)` boundary,
 * where an `enterWith` performed inside the awaited auth helper cannot flow back
 * into its caller's already-created promise continuation.
 */
export function registerDbRlsContextResolver(
  resolver: DbRlsContextResolver | undefined,
): void {
  globalThis.dbRlsContextResolver = resolver;
}

type RawClientQuery = (...args: unknown[]) => Promise<unknown>;
type ContextualPoolClient = PoolClient & { __rlsSessionClean?: boolean };

const TENANT_CONTEXT_TRANSACTION_QUERY =
  "SELECT pg_current_xact_id()::text AS transaction_id, floor(extract(epoch FROM clock_timestamp()))::bigint AS database_epoch_seconds";

async function scrubSessionDbContext(query: RawClientQuery): Promise<void> {
  // Neon transaction pooling supports DISCARD ALL as its session-reset
  // primitive. It clears temporary objects, session GUCs, and server-side
  // prepared statements; any unsupported or ambiguous result destroys the
  // checkout instead of returning it.
  const result = await query("DISCARD ALL");
  if (
    !result ||
    typeof result !== "object" ||
    !("command" in result) ||
    (result as { command?: unknown }).command !== "DISCARD"
  ) {
    throw new Error("Database session tenant context could not be scrubbed.");
  }
}

function forgetDiscardedPreparedStatements(client: PoolClient): void {
  const connection = (
    client as PoolClient & {
      connection?: { parsedStatements?: Record<string, string> };
    }
  ).connection;
  if (connection?.parsedStatements) {
    for (const name of Object.keys(connection.parsedStatements)) {
      delete connection.parsedStatements[name];
    }
  }
}

async function applyLocalDbContext(
  query: RawClientQuery,
  context: DbRlsContext | undefined,
): Promise<number | undefined> {
  if (!context) {
    await query(
      "SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', '', true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'off', true)",
    );
    return undefined;
  }
  if (context.bypassRls) {
    await query(
      "SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', '', true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'on', true)",
    );
    return undefined;
  }

  const transaction = await query(TENANT_CONTEXT_TRANSACTION_QUERY);
  const transactionRows =
    transaction && typeof transaction === "object" && "rows" in transaction
      ? (
          transaction as {
            rows?: Array<{
              database_epoch_seconds?: unknown;
              transaction_id?: unknown;
            }>;
          }
        ).rows
      : undefined;
  const transactionRow = transactionRows?.[0];
  const transactionId = String(transactionRow?.transaction_id ?? "");
  const databaseEpochSeconds = Number(transactionRow?.database_epoch_seconds);
  if (
    transactionRows?.length !== 1 ||
    !TENANT_CONTEXT_TRANSACTION_ID_RE.test(transactionId) ||
    !Number.isSafeInteger(databaseEpochSeconds) ||
    databaseEpochSeconds < 0
  ) {
    throw new Error("Database transaction identity is invalid.");
  }
  const signed = signTenantContext(context.tenantId, undefined, {
    nowMs: databaseEpochSeconds * 1000,
    transactionId,
  });
  const result = await query(
    "WITH configured AS MATERIALIZED (SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', $2, true), set_config('app.tenant_context_key_id', $3, true), set_config('app.tenant_context_expires_at', $4, true), set_config('app.tenant_context_nonce', $5, true), set_config('app.tenant_context_signature', $6, true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'off', true)) SELECT app_private.verified_tenant_id()::text AS verified_tenant_id, GREATEST($4::bigint - floor(extract(epoch FROM clock_timestamp()))::bigint, 0)::integer AS remaining_seconds FROM configured",
    [
      signed.tenantId,
      signed.audience,
      signed.keyId,
      signed.expiresAt,
      signed.nonce,
      signed.signature,
    ],
  );
  const rows =
    result && typeof result === "object" && "rows" in result
      ? (
          result as {
            rows?: Array<{
              remaining_seconds?: unknown;
              verified_tenant_id?: unknown;
            }>;
          }
        ).rows
      : undefined;
  const verified = rows?.[0];
  const remainingSeconds = Number(verified?.remaining_seconds);
  if (
    rows?.length !== 1 ||
    verified?.verified_tenant_id !== signed.tenantId ||
    !Number.isSafeInteger(remainingSeconds) ||
    remainingSeconds <= 0
  ) {
    throw new Error("Database rejected the signed tenant context.");
  }
  return performance.now() + Math.max(1, remainingSeconds - 60) * 1000;
}

function contextsMatch(
  left: DbRlsContext | undefined,
  right: DbRlsContext | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (left.bypassRls || right.bypassRls) {
    return Boolean(
      left.bypassRls &&
      right.bypassRls &&
      left.justification.id === right.justification.id,
    );
  }
  return left.tenantId === right.tenantId;
}

function assertSingleSqlStatement(source: string): void {
  let state: "block" | "double" | "line" | "single" | "sql" = "sql";
  let dollarDelimiter = "";
  let escapeString = false;
  let terminator = -1;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (dollarDelimiter) {
      if (source.startsWith(dollarDelimiter, index)) {
        index += dollarDelimiter.length - 1;
        dollarDelimiter = "";
      }
      continue;
    }
    if (state === "line") {
      if (current === "\n" || current === "\r") state = "sql";
      continue;
    }
    if (state === "block") {
      if (current === "*" && next === "/") {
        index += 1;
        state = "sql";
      }
      continue;
    }
    if (state === "single") {
      if (escapeString && current === "\\") {
        index += 1;
      } else if (current === "'" && next === "'") {
        index += 1;
      } else if (current === "'") {
        state = "sql";
      }
      continue;
    }
    if (state === "double") {
      if (current === '"' && next === '"') index += 1;
      else if (current === '"') state = "sql";
      continue;
    }

    if (current === "-" && next === "-") {
      index += 1;
      state = "line";
    } else if (current === "/" && next === "*") {
      index += 1;
      state = "block";
    } else if (current === "'") {
      const prefix = source[index - 1];
      const beforePrefix = source[index - 2];
      escapeString =
        (prefix === "e" || prefix === "E") &&
        (beforePrefix === undefined || !/[A-Za-z0-9_$]/.test(beforePrefix));
      state = "single";
    } else if (current === '"') {
      state = "double";
    } else if (current === "$") {
      const previous = source[index - 1];
      const followsIdentifier =
        previous !== undefined &&
        (/[A-Za-z0-9_$]/.test(previous) || previous.charCodeAt(0) >= 0x80);
      const delimiter = source
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      // PostgreSQL requires whitespace between a keyword/identifier and a
      // dollar-quoted literal. Without this boundary, `foo$tag$` is one
      // identifier; treating it as a delimiter would hide injected semicolons
      // from this scanner while the server executes them.
      if (delimiter && !followsIdentifier) {
        dollarDelimiter = delimiter;
        index += delimiter.length - 1;
      }
    } else if (current === ";") {
      if (terminator !== -1 || source.slice(index + 1).trim() !== "") {
        throw new Error("Multi-statement database queries are not supported.");
      }
      terminator = index;
    }
  }
  if (
    state === "single" ||
    state === "double" ||
    state === "block" ||
    dollarDelimiter
  ) {
    throw new Error("Unterminated SQL literal or comment.");
  }
}

function stripLeadingSqlTrivia(source: string): string {
  let index = 0;
  while (index < source.length) {
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source.startsWith("--", index)) {
      const lineEnd = source.slice(index + 2).search(/[\r\n]/u);
      if (lineEnd < 0) return "";
      index += lineEnd + 2;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      continue;
    }
    break;
  }
  return source.slice(index);
}

function transactionCommand(
  queryArgs: unknown[],
): "begin" | "commit" | "rollback" | "in-transaction" | "query" {
  const input = queryArgs[0];
  const configuredText =
    input && typeof input === "object"
      ? (input as { text?: unknown }).text
      : undefined;
  const text =
    typeof input === "string"
      ? input
      : typeof configuredText === "string"
        ? configuredText
        : null;
  if (text === null) {
    throw new Error(
      "Streaming and cursor queries are not supported by the RLS context wrapper.",
    );
  }

  assertSingleSqlStatement(text);

  const normalized = stripLeadingSqlTrivia(text)
    .trim()
    .replace(/;$/, "")
    .trim();
  if (/^(?:BEGIN|START\s+TRANSACTION)$/i.test(normalized)) return "begin";
  if (/^(?:COMMIT|END)$/i.test(normalized)) return "commit";
  if (/^(?:ROLLBACK|ABORT)$/i.test(normalized)) return "rollback";
  const savepointIdentifier = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';
  if (
    new RegExp(`^SAVEPOINT\\s+${savepointIdentifier}$`, "i").test(normalized) ||
    new RegExp(`^RELEASE\\s+SAVEPOINT\\s+${savepointIdentifier}$`, "i").test(
      normalized,
    ) ||
    new RegExp(
      `^ROLLBACK\\s+TO(?:\\s+SAVEPOINT)?\\s+${savepointIdentifier}$`,
      "i",
    ).test(normalized)
  ) {
    return "in-transaction";
  }
  if (
    /^(?:ABORT|BEGIN|START\b|COMMIT|END|PREPARE|ROLLBACK|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "Unsupported or multi-statement transaction control query.",
    );
  }
  return "query";
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

function forceExtendedQueryMode(queryArgs: unknown[]): unknown[] {
  const input = queryArgs[0];
  if (typeof input === "string") {
    return [{ text: input, queryMode: "extended" }, ...queryArgs.slice(1)];
  }
  if (
    input &&
    typeof input === "object" &&
    typeof (input as { text?: unknown }).text === "string"
  ) {
    return [
      { ...(input as Record<string, unknown>), queryMode: "extended" },
      ...queryArgs.slice(1),
    ];
  }
  return queryArgs;
}

function wrapClientWithTransactionLocalContext(client: PoolClient): PoolClient {
  const contextualState = client as ContextualPoolClient;
  const originalQueryMethod = client.query;
  const originalRelease = client.release.bind(client) as (
    err?: Error | boolean,
  ) => void;
  const rawQuery: RawClientQuery = (...args: unknown[]) =>
    Promise.resolve(Reflect.apply(originalQueryMethod, client, args));
  let transactionActive = false;
  let transactionContext: DbRlsContext | undefined;
  let transactionContextRefreshAtMs: number | undefined;
  let destroyOnRelease: Error | undefined;
  let released = false;
  let queryQueue: Promise<void> = Promise.resolve();
  let pendingQueries = 0;

  const scrubOrDestroy = async (): Promise<void> => {
    try {
      await scrubSessionDbContext(rawQuery);
      forgetDiscardedPreparedStatements(client);
      contextualState.__rlsSessionClean = true;
    } catch (error) {
      destroyOnRelease = asError(
        error,
        "Failed to scrub database session context.",
      );
      throw destroyOnRelease;
    }
  };

  const rollbackAfterFailure = async (): Promise<void> => {
    if (!transactionActive) return;
    try {
      await rawQuery("ROLLBACK");
    } catch (rollbackError) {
      destroyOnRelease = asError(
        rollbackError,
        "Failed to roll back contextual database transaction.",
      );
    } finally {
      transactionActive = false;
      transactionContext = undefined;
      transactionContextRefreshAtMs = undefined;
    }
    if (!destroyOnRelease) {
      await scrubOrDestroy();
    }
  };

  const assertStableTransactionContext = async (): Promise<void> => {
    const context = await resolvedContext();
    if (!contextsMatch(context, transactionContext)) {
      throw new Error(
        "Database RLS context changed during an active transaction.",
      );
    }
  };

  const execute = async (queryArgs: unknown[]): Promise<unknown> => {
    if (destroyOnRelease) {
      throw new Error(
        "Database client is quarantined after an ambiguous session cleanup.",
      );
    }
    const command = transactionCommand(queryArgs);

    if (command === "begin") {
      if (transactionActive)
        throw new Error("Nested database transactions are not supported.");
      const context = await resolvedContext();
      transactionActive = true;
      transactionContext = context;
      contextualState.__rlsSessionClean = false;
      try {
        const beginResult = await rawQuery(...queryArgs);
        transactionContextRefreshAtMs = await applyLocalDbContext(
          rawQuery,
          context,
        );
        return beginResult;
      } catch (error) {
        await rollbackAfterFailure();
        throw error;
      }
    }

    if (command === "commit" || command === "rollback") {
      if (!transactionActive) return rawQuery(...queryArgs);
      await assertStableTransactionContext();
      try {
        const result = await rawQuery(...queryArgs);
        transactionActive = false;
        transactionContext = undefined;
        transactionContextRefreshAtMs = undefined;
        if (!contextualState.__rlsSessionClean)
          await scrubOrDestroy().catch(() => undefined);
        return result;
      } catch (error) {
        destroyOnRelease = asError(
          error,
          `Failed to ${command} contextual database transaction.`,
        );
        throw error;
      }
    }

    if (command === "in-transaction") {
      if (!transactionActive) {
        throw new Error(
          "Transaction savepoint command requires an active transaction.",
        );
      }
      await assertStableTransactionContext();
      // Transaction-control statements must remain executable in an aborted
      // subtransaction; issuing a context query before ROLLBACK TO SAVEPOINT
      // would itself fail with 25P02. The next ordinary statement refreshes if
      // the signature is near expiry.
      return rawQuery(...queryArgs);
    }

    if (transactionActive) {
      await assertStableTransactionContext();
      // Refresh only inside the final minute of the short replay window. Most
      // transactions pay no extra round trip, while a legitimate long-lived
      // transaction cannot silently lose its tenant context mid-flight.
      if (
        transactionContext &&
        !transactionContext.bypassRls &&
        transactionContextRefreshAtMs !== undefined &&
        performance.now() >= transactionContextRefreshAtMs
      ) {
        transactionContextRefreshAtMs = await applyLocalDbContext(
          rawQuery,
          transactionContext,
        );
      }
      contextualState.__rlsSessionClean = false;
      return rawQuery(...forceExtendedQueryMode(queryArgs));
    }

    const context = await resolvedContext();
    transactionActive = true;
    transactionContext = context;
    contextualState.__rlsSessionClean = false;
    try {
      await rawQuery("BEGIN");
      transactionContextRefreshAtMs = await applyLocalDbContext(
        rawQuery,
        context,
      );
      contextualState.__rlsSessionClean = false;
      const result = await rawQuery(...forceExtendedQueryMode(queryArgs));
      try {
        await rawQuery("COMMIT");
      } catch (commitError) {
        destroyOnRelease = asError(
          commitError,
          "Failed to commit contextual database query.",
        );
        throw commitError;
      }
      transactionActive = false;
      transactionContext = undefined;
      transactionContextRefreshAtMs = undefined;
      await scrubOrDestroy().catch(() => undefined);
      return result;
    } catch (error) {
      await rollbackAfterFailure();
      throw error;
    }
  };

  client.query = ((...args: unknown[]) => {
    if (released) {
      const error = new Error("Database client has already been released.");
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        (callback as (error: Error) => void)(error);
        return undefined;
      }
      return Promise.reject(error);
    }
    const callback = args[args.length - 1];
    const schedule = (queryArgs: unknown[]): Promise<unknown> => {
      pendingQueries += 1;
      const result = queryQueue.then(
        () => execute(queryArgs),
        () => execute(queryArgs),
      );
      queryQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result.finally(() => {
        pendingQueries -= 1;
      });
    };
    if (typeof callback === "function") {
      const queryCallback = callback as (
        error: Error | null,
        result?: unknown,
      ) => void;
      const queryArgs = args.slice(0, -1);
      void schedule(queryArgs).then(
        (result) => queryCallback(null, result),
        (error) =>
          queryCallback(asError(error, "Contextual database query failed.")),
      );
      return undefined;
    }
    return schedule(args);
  }) as PoolClient["query"];

  client.release = ((err?: Error | boolean) => {
    if (released) return;
    released = true;
    client.query = originalQueryMethod;

    if (err) {
      originalRelease(err);
      return;
    }

    if (
      pendingQueries === 0 &&
      !transactionActive &&
      contextualState.__rlsSessionClean
    ) {
      originalRelease(destroyOnRelease);
      return;
    }

    const cleanup = queryQueue.then(() =>
      transactionActive
        ? rollbackAfterFailure()
        : contextualState.__rlsSessionClean
          ? Promise.resolve()
          : scrubOrDestroy().catch(() => undefined),
    );
    void cleanup.then(
      () => originalRelease(destroyOnRelease),
      (error) =>
        originalRelease(
          destroyOnRelease ??
            asError(error, "Failed to clean database session before release."),
        ),
    );
  }) as PoolClient["release"];

  return client;
}

export function patchPoolForRlsContext(targetPool: Pool): Pool {
  const poolWithPatch = targetPool as Pool & { __rlsContextPatched?: boolean };
  if (poolWithPatch.__rlsContextPatched) return targetPool;

  const originalConnect = targetPool.connect.bind(targetPool);

  poolWithPatch.connect = (async (...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === "function") {
      try {
        await resolvedContext();
      } catch (contextError) {
        callback(contextError);
        return;
      }

      return originalConnect(
        async (
          err: Error,
          client: PoolClient,
          done: (release?: Error | boolean) => void,
        ) => {
          if (err || !client) {
            callback(err, client, done);
            return;
          }

          try {
            const rawClientQuery: RawClientQuery = (...queryArgs: unknown[]) =>
              Promise.resolve(Reflect.apply(client.query, client, queryArgs));
            const contextualState = client as ContextualPoolClient;
            if (!contextualState.__rlsSessionClean) {
              await scrubSessionDbContext(rawClientQuery);
              forgetDiscardedPreparedStatements(client);
              contextualState.__rlsSessionClean = true;
            }
            const contextualClient =
              wrapClientWithTransactionLocalContext(client);
            callback(
              undefined,
              contextualClient,
              contextualClient.release.bind(contextualClient),
            );
          } catch (contextError) {
            client.release(contextError as Error);
            callback(contextError, client, done);
          }
        },
      );
    }

    await resolvedContext();
    const client = await originalConnect();
    const rawClientQuery: RawClientQuery = (...queryArgs: unknown[]) =>
      Promise.resolve(Reflect.apply(client.query, client, queryArgs));
    try {
      const contextualState = client as ContextualPoolClient;
      if (!contextualState.__rlsSessionClean) {
        await scrubSessionDbContext(rawClientQuery);
        forgetDiscardedPreparedStatements(client);
        contextualState.__rlsSessionClean = true;
      }
      return wrapClientWithTransactionLocalContext(client);
    } catch (error) {
      client.release(asError(error, "Failed to prepare database checkout."));
      throw error;
    }
  }) as Pool["connect"];

  poolWithPatch.query = ((...args: any[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      const queryArgs = args.slice(0, -1);
      void poolWithPatch
        .connect()
        .then((client) => {
          client.query(...queryArgs, (err: Error, result: unknown) => {
            client.release(err || undefined);
            callback(err, result);
          });
        })
        .catch((err) => callback(err));
      return undefined;
    }

    return poolWithPatch.connect().then(async (client) => {
      try {
        return await client.query(...args);
      } finally {
        client.release();
      }
    });
  }) as Pool["query"];

  poolWithPatch.__rlsContextPatched = true;
  globalThis.pgPoolContextPatched = true;
  return targetPool;
}

/**
 * Routes ordinary and tenant-scoped queries to the tenant runtime role, and
 * reviewed bypass contexts to the separately credentialed platform role.
 * Both physical pools retain the transaction-local context wrapper, so a
 * checked-out connection cannot change context mid-transaction.
 */
export function createRlsRoutingPool(
  tenantPool: Pool,
  platformPool: Pool,
): Pool {
  const selectPool = async (): Promise<Pool> => {
    const context = await resolvedContext();
    return context?.bypassRls ? platformPool : tenantPool;
  };

  const connect = (...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === "function") {
      void selectPool().then(
        (selected) => selected.connect(callback as never),
        (error) =>
          (callback as (error: Error) => void)(
            asError(error, "Database context resolution failed."),
          ),
      );
      return undefined;
    }
    return selectPool().then((selected) => selected.connect());
  };

  const query = (...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      void selectPool().then(
        (selected) => Reflect.apply(selected.query, selected, args),
        (error) =>
          (callback as (error: Error) => void)(
            asError(error, "Database context resolution failed."),
          ),
      );
      return undefined;
    }
    return selectPool().then((selected) =>
      Reflect.apply(selected.query, selected, args),
    );
  };

  const end = async (): Promise<void> => {
    await Promise.all([tenantPool.end(), platformPool.end()]);
  };

  return new Proxy(tenantPool, {
    get(target, property) {
      if (property === "connect") return connect;
      if (property === "query") return query;
      if (property === "end") return end;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Connection pool — optimized for serverless (Vercel + Neon.tech free tier)
const tenantPool = patchPoolForRlsContext(
  globalThis.pgPool ||
    new Pool({
      ...resolveDatabaseConnectionOptions(connectionString),
      max: getLimit("DB_POOL_MAX"),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }),
);

const platformPool = patchPoolForRlsContext(
  globalThis.pgPlatformPool ||
    new Pool({
      ...resolveDatabaseConnectionOptions(platformConnectionString),
      max: getLimit("DB_POOL_MAX"),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }),
);

export const pool = createRlsRoutingPool(tenantPool, platformPool);

if (process.env.NODE_ENV !== "production") {
  globalThis.pgPool = tenantPool;
  globalThis.pgPlatformPool = platformPool;
}

export const db = globalThis.drizzleDb || drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.drizzleDb = db;
}

/**
 * Raw-SQL tagged template bound to the RLS-routing pool — the raw-Neon-Postgres
 * replacement for the Drizzle query builder. The runner is resolved lazily on each
 * call, so every query observes the current tenant/platform routing and the signed
 * per-connection context, exactly as `db` does. Prefer `sql` for new code.
 */
export const sql = createSqlTag(() => pool);
export { SqlQuery, createSqlTag, sqlFor } from "./sql";
export type { SqlRunner, SqlTag } from "./sql";

export function getCurrentDbContext(): DbRlsContext | undefined {
  return currentContext();
}

export async function runWithTenantContext<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  assertTenantId(tenantId);
  return dbContext.run({ tenantId }, fn);
}

export async function runWithRlsBypass<T>(
  justification: RlsBypassJustification,
  fn: () => Promise<T>,
): Promise<T> {
  assertRlsBypassJustification(justification);
  return dbContext.run({ bypassRls: true, justification }, fn);
}

export const runWithPlatformContext = runWithRlsBypass;

/**
 * Wrapper for executing raw queries within a specific tenant context (RLS).
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return runWithTenantContext(tenantId, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
}
