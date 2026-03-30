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

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
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
    idle_timeout: getLimit('DB_IDLE_TIMEOUT'), // Free tier: 10s (save compute hours)
    connect_timeout: 10,
    ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
    prepare: false,          // Required for Neon.tech serverless driver
});

export const db = drizzle(client, { schema });

/**
 * Set the tenant context for RLS.
 * MUST be called before any tenant-scoped query.
 *
 * Usage:
 *   await setTenantContext(tenantId);
 *   const results = await db.select().from(students);
 *   // ^ Only returns students for the given tenant
 *
 * For Platform Admins (cross-tenant access):
 *   await setTenantContext('platform');
 */
export async function setTenantContext(tenantId: string): Promise<void> {
    await db.execute(
        sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`
    );
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
