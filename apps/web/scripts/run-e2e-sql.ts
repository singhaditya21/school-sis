import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

async function run() {
    console.log('⏳ Running E2E user insertion SQL script against the database...');
    const sqlFilePath = process.env.E2E_SQL_FILE
        ? path.resolve(process.env.E2E_SQL_FILE)
        : path.resolve(__dirname, '../../../insert_e2e_users.sql');
    if (!fs.existsSync(sqlFilePath)) {
        console.error(`❌ SQL file not found at: ${sqlFilePath}`);
        process.exit(1);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    const client = postgres(connectionString, { max: 1 });

    try {
        // Run the statements using unsafe which supports multi-statement queries
        await client.unsafe(sqlContent);
        console.log('✅ E2E SQL script run completed successfully!');
    } catch (error) {
        console.error('❌ Error executing E2E SQL script:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run().catch((err) => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});
