import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
    try {
        await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
        console.log('✅ Vector extension enabled successfully!');
    } catch (e) {
        console.error('❌ Failed to enable vector extension:', e);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

main();
