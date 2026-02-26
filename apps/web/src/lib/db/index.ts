import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Database connection — uses postgres.js driver with Drizzle ORM.
 * Connection string comes from DATABASE_URL env var (never hardcoded).
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is required. ' +
        'Set it in your .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname'
    );
}

// For query purposes (connection pooling handled by postgres.js)
const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

export const db = drizzle(client, { schema });

// Re-export schema for convenience
export { schema };
