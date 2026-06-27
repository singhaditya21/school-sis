import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { getLimit } from '@/lib/config/limits';

/**
 * Database connection — uses native pg.Pool
 *
 * SECURITY:
 * - Crashes if DATABASE_URL is missing
 * - Enforces SSL in production
 * - Provides () for RLS enforcement
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

// Connection pool — optimized for serverless (Vercel + Neon.tech free tier)
export const pool = new Pool({
    connectionString,
    max: getLimit('DB_POOL_MAX'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.NODE_ENV === 'production' && !connectionString.includes('localhost') ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

/**
 * Wrapper for executing raw queries within a specific tenant context (RLS).
 * Uses set_config(..., true) so the config is scoped ONLY to the current transaction.
 */
export async function withTenant<T>(
    tenantId: string,
    fn: (client: any) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 'true' as the third argument scopes the setting to this specific transaction block.
        await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
        
        const result = await fn(client);
        
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
