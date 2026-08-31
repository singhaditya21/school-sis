import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

async function run() {
    console.log('⏳ Running E2E user insertion SQL script against the database...');
    const sqlFilePath = process.env.E2E_SQL_FILE
        ? path.resolve(process.env.E2E_SQL_FILE)
        : path.resolve(__dirname, '../e2e/fixtures/e2e-seed.sql');
    if (!fs.existsSync(sqlFilePath)) {
        console.error(`❌ SQL file not found at: ${sqlFilePath}`);
        process.exit(1);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    const pool = new Pool({
        ...resolveDatabaseConnectionOptions(connectionString),
        max: 1,
    });

    try {
        // A parameter-less pool.query uses node-pg's simple-query protocol, which
        // runs the whole multi-statement file in one call — the raw-pg equivalent
        // of postgres-js's client.unsafe(...).
        await pool.query(sqlContent);
        console.log('✅ E2E SQL script run completed successfully!');
    } catch (error) {
        console.error('❌ Error executing E2E SQL script:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run().catch((err) => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});
