import { AsyncLocalStorage } from 'async_hooks';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { getLimit } from '@/lib/config/limits';

/**
 * Database connection — uses native pg.Pool
 *
 * SECURITY:
 * - Crashes if DATABASE_URL is missing
 * - Enforces SSL in production
 * - Provides per-request tenant context for RLS enforcement
 */

const isBuildPhase = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

let connectionString = process.env.DATABASE_URL || '';

if (isBuildPhase) {
    connectionString = 'postgresql://dummy:dummy@dummy:5432/dummy';
}

if (!isBuildPhase && !process.env.DATABASE_URL) {
    throw new Error(
        'DATABASE_URL environment variable is required. ' +
        'Set it in your .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require'
    );
}

// Warn if SSL is not enforced in production
if (process.env.NODE_ENV === 'production' && !connectionString.includes('sslmode=require') && !connectionString.includes('localhost')) {
    console.warn(
        '[DB] WARNING: DATABASE_URL does not include sslmode=require. ' +
        'In production, all database connections must be encrypted.'
    );
}

declare global {
    var pgPool: Pool | undefined;
    var drizzleDb: any | undefined;
    var pgPoolContextPatched: boolean | undefined;
}

type DbRlsContext =
    | { tenantId: string; bypassRls?: false }
    | { tenantId?: undefined; bypassRls: true };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dbContext = new AsyncLocalStorage<DbRlsContext>();

function assertTenantId(tenantId: string): void {
    if (!UUID_RE.test(tenantId)) {
        throw new Error('Invalid tenant context.');
    }
}

function currentContext(): DbRlsContext | undefined {
    return dbContext.getStore();
}

async function applyDbContext(client: PoolClient, context: DbRlsContext): Promise<void> {
    if (context.bypassRls) {
        await client.query(
            "SELECT set_config('app.current_tenant', '', false), set_config('app.bypass_rls', 'on', false)"
        );
        return;
    }

    await client.query(
        "SELECT set_config('app.current_tenant', $1, false), set_config('app.bypass_rls', 'off', false)",
        [context.tenantId],
    );
}

async function resetDbContext(client: PoolClient): Promise<void> {
    await client.query(
        "SELECT set_config('app.current_tenant', '', false), set_config('app.bypass_rls', 'off', false)"
    );
}

function wrapReleaseWithContextReset(client: PoolClient): void {
    const wrappedClient = client as PoolClient & { __rlsReleaseWrapped?: boolean };
    if (wrappedClient.__rlsReleaseWrapped) return;

    const release = client.release.bind(client) as (err?: Error | boolean) => void;
    let released = false;

    wrappedClient.__rlsReleaseWrapped = true;
    wrappedClient.release = ((err?: Error | boolean) => {
        if (released) return;
        released = true;

        if (err) {
            release(err);
            return;
        }

        void resetDbContext(client)
            .catch((resetError) => {
                console.error('[DB] Failed to reset RLS context before releasing client:', resetError);
            })
            .finally(() => release());
    }) as PoolClient['release'];
}

function patchPoolForRlsContext(targetPool: Pool): Pool {
    const poolWithPatch = targetPool as Pool & { __rlsContextPatched?: boolean };
    if (poolWithPatch.__rlsContextPatched) return targetPool;

    const originalConnect = targetPool.connect.bind(targetPool);
    const originalQuery = targetPool.query.bind(targetPool);

    poolWithPatch.connect = (async (...args: any[]) => {
        const callback = args[0];
        if (typeof callback === 'function') {
            return originalConnect(async (err: Error, client: PoolClient, done: (release?: Error | boolean) => void) => {
                if (err || !client) {
                    callback(err, client, done);
                    return;
                }

                const context = currentContext();
                if (!context) {
                    callback(err, client, done);
                    return;
                }

                try {
                    await applyDbContext(client, context);
                    wrapReleaseWithContextReset(client);
                    callback(undefined, client, client.release.bind(client));
                } catch (contextError) {
                    client.release(contextError as Error);
                    callback(contextError, client, done);
                }
            });
        }

        const client = await originalConnect();
        const context = currentContext();
        if (context) {
            await applyDbContext(client, context);
            wrapReleaseWithContextReset(client);
        }
        return client;
    }) as Pool['connect'];

    poolWithPatch.query = ((...args: any[]) => {
        const context = currentContext();
        if (!context) {
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
    connectionString,
    max: getLimit('DB_POOL_MAX'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.NODE_ENV === 'production' && !connectionString.includes('localhost') ? { rejectUnauthorized: false } : undefined,
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

export function enterTenantContext(tenantId: string): void {
    assertTenantId(tenantId);
    dbContext.enterWith({ tenantId });
}

export function enterRlsBypassContext(): void {
    dbContext.enterWith({ bypassRls: true });
}

export const enterPlatformContext = enterRlsBypassContext;

export async function runWithTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    assertTenantId(tenantId);
    return dbContext.run({ tenantId }, fn);
}

export async function runWithRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
    return dbContext.run({ bypassRls: true }, fn);
}

export const runWithPlatformContext = runWithRlsBypass;

/**
 * Wrapper for executing raw queries within a specific tenant context (RLS).
 */
export async function withTenant<T>(
    tenantId: string,
    fn: (client: any) => Promise<T>
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
