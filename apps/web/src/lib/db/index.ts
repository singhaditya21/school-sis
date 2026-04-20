import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { getLimit } from '@/lib/config/limits';

/**
 * Database connection — uses postgres.js driver with Drizzle ORM.
 *
 * SECURITY:
 * - Crashes if DATABASE_URL is missing
 * - Enforces SSL in production
 * - Provides setTenantContext() for RLS enforcement
 * - Serverless-optimized pool settings
 */

const isBuildPhase = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

// Database connection string — MUST come from DATABASE_URL env var.
// During Vercel build phase, use a dummy string to prevent postgres.js from hanging Webpack.
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
if (process.env.NODE_ENV === 'production' && !connectionString.includes('sslmode=require')) {
    console.warn(
        '[DB] WARNING: DATABASE_URL does not include sslmode=require. ' +
        'In production, all database connections must be encrypted.'
    );
}

// Connection pool — optimized for serverless (Vercel + Neon.tech free tier)
const client = postgres(connectionString, {
    max: getLimit('DB_POOL_MAX'),           // Free tier: 3 connections
    idle_timeout: 30, // Increased to 30s to prevent early reap collisions with PgBouncer
    connect_timeout: 10,
    ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
});

export const db = drizzle(client, { schema });

/**
 * Set the tenant context for RLS.
 * SECURITY OVERRIDE: Floating RLS logic is disabled because Drizzle connection pooling
 * bleeds `app.current_tenant` onto generic sockets, causing horrific cross-tenant data leaks.
 * All queries must securely use standard `.where(eq(tenantId))` logic until pure 
 * Transactional wrappers (`withTenant`) are globally mandated.
 */
export async function setTenantContext(tenantId: string): Promise<void> {
    // No-op to prevent codebase build breaking while neutralizing the vulnerability.
    return Promise.resolve();
}

export async function withTenant<T>(
    tenantId: string,
    fn: (tx: any) => Promise<T>
): Promise<T> {
    // Note: In postgres.js, set_config with `true` scopes to the transaction.
    // We MUST wrap this in a Drizzle transaction, otherwise the context is immediately
    // dumped at the end of the set_config statement, or it leaks to the connection pool.
    return db.transaction(async (tx) => {
        await tx.execute(
            sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`
        );
        return fn(tx);
    });
}

// Re-export schema for convenience
export { schema };
