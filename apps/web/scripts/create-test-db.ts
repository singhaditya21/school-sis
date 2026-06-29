import { Client } from 'pg';

async function main() {
    const testDbUrl = process.env.DATABASE_URL;
    if (!testDbUrl) {
        console.error('DATABASE_URL is not set');
        process.exit(1);
    }

    const urlObj = new URL(testDbUrl);
    const dbName = urlObj.pathname.slice(1);
    
    // Connect to 'postgres' database to check and create the test database
    urlObj.pathname = '/postgres';
    const client = new Client({ connectionString: urlObj.toString() });
    
    try {
        await client.connect();
        
        // Check if database exists
        const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (res.rowCount === 0) {
            console.log(`Creating database ${dbName}...`);
            await client.query(`CREATE DATABASE ${dbName}`);
            console.log(`Database ${dbName} created successfully.`);
        } else {
            console.log(`Database ${dbName} already exists.`);
        }
    } catch (err) {
        console.error('Error in create-test-db.ts:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
