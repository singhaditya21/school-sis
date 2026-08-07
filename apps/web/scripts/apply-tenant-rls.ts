import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL or DIRECT_URL is required to apply tenant RLS.');
    process.exit(1);
}

const migrationPath = fileURLToPath(
    new URL('../../../packages/api/src/db/migrations/tenant-rls.sql', import.meta.url)
);

const sql = readFileSync(migrationPath, 'utf8');
const pool = new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
});

async function main() {
    const client = await pool.connect();
    try {
        await client.query(sql);
        console.info('Tenant RLS policies applied successfully.');
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error('Failed to apply tenant RLS policies:', error);
    process.exitCode = 1;
});
