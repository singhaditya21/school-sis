import { AsyncLocalStorage } from 'async_hooks';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { getLimit } from '@/lib/config/limits';
import { resolveDatabaseConnectionOptions } from './ssl';
import {
    assertRlsBypassJustification,
    type RlsBypassJustification,
} from './rls-bypass';

export { resolveDatabaseConnectionOptions, resolveDatabaseSsl } from './ssl';
export { RLS_BYPASS_JUSTIFICATIONS, type RlsBypassJustification } from './rls-bypass';

/**
 * Database connection — uses native pg.Pool
 *
 * SECURITY:
 * - Crashes if DATABASE_URL is missing
 * - Enforces SSL in production
 * - Provides per-request tenant context for RLS enforcement
 */

const isBuildPhase = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

function normalizeRuntimeDatabaseUrl(value: string): string {
    // Local-first: no cloud SSL is enforced. Just validate the shape.
    if (!value || isBuildPhase) return value;
    try {
        const parsed = new URL(value);
        if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
            throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
        }
    } catch (err) {
        if (err instanceof Error && err.message.includes('postgres://')) throw err;
        throw new Error('DATABASE_URL must be a valid Postgres URL.');
    }
    return value;
}

let connectionString = normalizeRuntimeDatabaseUrl(process.env.DATABASE_URL || '');

if (isBuildPhase) {
    connectionString = 'postgresql://dummy:dummy@dummy:5432/dummy';
} else if (connectionString && process.env.DATABASE_URL !== connectionString) {
    process.env.DATABASE_URL = connectionString;
}

if (!isBuildPhase && !process.env.DATABASE_URL) {
    throw new Error(
        'DATABASE_URL environment variable is required. ' +
        'Set it in your .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require'
    );
}

declare global {
    var pgPool: Pool | undefined;
    var drizzleDb: any | undefined;
    var pgPoolContextPatched: boolean | undefined;
}

type DbRlsContext =
    | { tenantId: string; bypassRls?: false }
    | { tenantId?: undefined; bypassRls: true; justification: RlsBypassJustification };

export type DbRlsContextResolver = () => DbRlsContext | undefined | Promise<DbRlsContext | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dbContext = new AsyncLocalStorage<DbRlsContext>();
let requestContextResolver: DbRlsContextResolver | undefined;

function assertTenantId(tenantId: string): void {
    if (!UUID_RE.test(tenantId)) {
        throw new Error('Invalid tenant context.');
    }
}

function currentContext(): DbRlsContext | undefined {
    return dbContext.getStore();
}

async function resolvedContext(): Promise<DbRlsContext | undefined> {
    const scoped = currentContext();
    if (scoped) return scoped;
    if (!requestContextResolver) return undefined;

    const resolved = await requestContextResolver();
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
export function registerDbRlsContextResolver(resolver: DbRlsContextResolver | undefined): void {
    requestContextResolver = resolver;
}

type RawClientQuery = (...args: unknown[]) => Promise<unknown>;

async function applyLocalDbContext(query: RawClientQuery, context: DbRlsContext): Promise<void> {
    if (context.bypassRls) {
        await query(
            "SELECT set_config('app.current_tenant', '', true), set_config('app.bypass_rls', 'on', true)"
        );
        return;
    }

    await query(
        "SELECT set_config('app.current_tenant', $1, true), set_config('app.bypass_rls', 'off', true)",
        [context.tenantId],
    );
}

function contextsMatch(left: DbRlsContext | undefined, right: DbRlsContext | undefined): boolean {
    if (!left || !right) return left === right;
    if (left.bypassRls || right.bypassRls) {
        return Boolean(
            left.bypassRls
            && right.bypassRls
            && left.justification.id === right.justification.id,
        );
    }
    return left.tenantId === right.tenantId;
}

function transactionCommand(queryArgs: unknown[]): 'begin' | 'commit' | 'rollback' | 'in-transaction' | 'query' {
    const input = queryArgs[0];
    const configuredText = input && typeof input === 'object'
        ? (input as { text?: unknown }).text
        : undefined;
    const text = typeof input === 'string'
        ? input
        : typeof configuredText === 'string'
            ? configuredText
            : null;
    if (text === null) {
        throw new Error('Streaming and cursor queries are not supported by the RLS context wrapper.');
    }

    const normalized = text.trim().replace(/;$/, '').trim();
    if (/^(?:BEGIN|START\s+TRANSACTION)$/i.test(normalized)) return 'begin';
    if (/^(?:COMMIT|END)$/i.test(normalized)) return 'commit';
    if (/^ROLLBACK$/i.test(normalized)) return 'rollback';
    if (/^(?:SAVEPOINT\b|RELEASE\s+SAVEPOINT\b|ROLLBACK\s+TO\b)/i.test(normalized)) {
        return 'in-transaction';
    }
    if (/^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK)\b/i.test(normalized)) {
        throw new Error('Unsupported or multi-statement transaction control query.');
    }
    return 'query';
}

function asError(value: unknown, fallback: string): Error {
    return value instanceof Error ? value : new Error(fallback);
}

function wrapClientWithTransactionLocalContext(client: PoolClient): PoolClient {
    const originalQueryMethod = client.query;
    const originalRelease = client.release.bind(client) as (err?: Error | boolean) => void;
    const rawQuery: RawClientQuery = (...args: unknown[]) => Promise.resolve(
        Reflect.apply(originalQueryMethod, client, args),
    );
    let transactionActive = false;
    let transactionContext: DbRlsContext | undefined;
    let destroyOnRelease: Error | undefined;
    let released = false;

    const rollbackAfterFailure = async (): Promise<void> => {
        if (!transactionActive) return;
        try {
            await rawQuery('ROLLBACK');
        } catch (rollbackError) {
            destroyOnRelease = asError(rollbackError, 'Failed to roll back contextual database transaction.');
        } finally {
            transactionActive = false;
            transactionContext = undefined;
        }
    };

    const assertStableTransactionContext = async (): Promise<void> => {
        const context = await resolvedContext();
        if (!contextsMatch(context, transactionContext)) {
            throw new Error('Database RLS context changed during an active transaction.');
        }
    };

    const execute = async (queryArgs: unknown[]): Promise<unknown> => {
        const command = transactionCommand(queryArgs);

        if (command === 'begin') {
            if (transactionActive) throw new Error('Nested database transactions are not supported.');
            const context = await resolvedContext();
            const beginResult = await rawQuery(...queryArgs);
            transactionActive = true;
            transactionContext = context;
            try {
                if (context) await applyLocalDbContext(rawQuery, context);
                return beginResult;
            } catch (error) {
                await rollbackAfterFailure();
                throw error;
            }
        }

        if (command === 'commit' || command === 'rollback') {
            if (!transactionActive) return rawQuery(...queryArgs);
            await assertStableTransactionContext();
            try {
                const result = await rawQuery(...queryArgs);
                transactionActive = false;
                transactionContext = undefined;
                return result;
            } catch (error) {
                destroyOnRelease = asError(error, `Failed to ${command} contextual database transaction.`);
                throw error;
            }
        }

        if (command === 'in-transaction') {
            if (!transactionActive) {
                throw new Error('Transaction savepoint command requires an active transaction.');
            }
            await assertStableTransactionContext();
            return rawQuery(...queryArgs);
        }

        if (transactionActive) {
            await assertStableTransactionContext();
            return rawQuery(...queryArgs);
        }

        const context = await resolvedContext();
        if (!context) return rawQuery(...queryArgs);

        await rawQuery('BEGIN');
        transactionActive = true;
        transactionContext = context;
        try {
            await applyLocalDbContext(rawQuery, context);
            const result = await rawQuery(...queryArgs);
            try {
                await rawQuery('COMMIT');
            } catch (commitError) {
                destroyOnRelease = asError(commitError, 'Failed to commit contextual database query.');
                throw commitError;
            }
            transactionActive = false;
            transactionContext = undefined;
            return result;
        } catch (error) {
            await rollbackAfterFailure();
            throw error;
        }
    };

    client.query = ((...args: unknown[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
            const queryCallback = callback as (error: Error | null, result?: unknown) => void;
            const queryArgs = args.slice(0, -1);
            void execute(queryArgs).then(
                (result) => queryCallback(null, result),
                (error) => queryCallback(asError(error, 'Contextual database query failed.')),
            );
            return undefined;
        }
        return execute(args);
    }) as PoolClient['query'];

    client.release = ((err?: Error | boolean) => {
        if (released) return;
        released = true;
        client.query = originalQueryMethod;

        if (err) {
            originalRelease(err);
            return;
        }

        if (transactionActive) {
            void rollbackAfterFailure().then(() => originalRelease(destroyOnRelease));
            return;
        }
        originalRelease(destroyOnRelease);
    }) as PoolClient['release'];

    return client;
}

export function patchPoolForRlsContext(targetPool: Pool): Pool {
    const poolWithPatch = targetPool as Pool & { __rlsContextPatched?: boolean };
    if (poolWithPatch.__rlsContextPatched) return targetPool;

    const originalConnect = targetPool.connect.bind(targetPool);
    const originalQuery = targetPool.query.bind(targetPool);

    poolWithPatch.connect = (async (...args: unknown[]) => {
        const callback = args[0];
        if (typeof callback === 'function') {
            try {
                await resolvedContext();
            } catch (contextError) {
                callback(contextError);
                return;
            }

            return originalConnect(async (err: Error, client: PoolClient, done: (release?: Error | boolean) => void) => {
                if (err || !client) {
                    callback(err, client, done);
                    return;
                }

                try {
                    const contextualClient = currentContext() || requestContextResolver
                        ? wrapClientWithTransactionLocalContext(client)
                        : client;
                    callback(undefined, contextualClient, contextualClient.release.bind(contextualClient));
                } catch (contextError) {
                    client.release(contextError as Error);
                    callback(contextError, client, done);
                }
            });
        }

        await resolvedContext();
        const client = await originalConnect();
        return currentContext() || requestContextResolver
            ? wrapClientWithTransactionLocalContext(client)
            : client;
    }) as Pool['connect'];

    poolWithPatch.query = ((...args: any[]) => {
        const context = currentContext();
        if (!context && !requestContextResolver) {
            return originalQuery(...args);
        }

        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
            const queryArgs = args.slice(0, -1);
            void poolWithPatch.connect()
                .then((client) => {
                    client.query(...queryArgs, (err: Error, result: unknown) => {
                        client.release(err || undefined);
                        callback(err, result);
                    });
                })
                .catch((err) => callback(err));
            return undefined;
        }

        return poolWithPatch.connect()
            .then(async (client) => {
                try {
                    return await client.query(...args);
                } finally {
                    client.release();
                }
            });
    }) as Pool['query'];

    poolWithPatch.__rlsContextPatched = true;
    globalThis.pgPoolContextPatched = true;
    return targetPool;
}

// Connection pool — optimized for serverless (Vercel + Neon.tech free tier)
export const pool = patchPoolForRlsContext(globalThis.pgPool || new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
    max: getLimit('DB_POOL_MAX'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
}));

if (process.env.NODE_ENV !== 'production') {
    globalThis.pgPool = pool;
}

export const db = globalThis.drizzleDb || drizzle(pool, { schema });

if (process.env.NODE_ENV !== 'production') {
    globalThis.drizzleDb = db;
}

export function getCurrentDbContext(): DbRlsContext | undefined {
    return currentContext();
}

export async function runWithTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
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
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    return runWithTenantContext(tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    });
}
