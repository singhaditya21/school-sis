import { execSync } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';

export default async function globalSetup() {
    console.log('\n🚀 [Test Setup] Initializing isolated database environment (Worker)...');

    const baseDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/school_sis';
    
    // Parse the base URL to connect to the default postgres database (to create the test db)
    const urlObj = new URL(baseDbUrl);
    const testDbName = 'school_sis_test_worker';
    
    urlObj.pathname = '/postgres';
    const adminClient = new Client({ connectionString: urlObj.toString() });
    
    await adminClient.connect();
    
    console.log(`📦 Creating test database: ${testDbName}`);
    // Terminate existing connections to test DB if any
    try {
        await adminClient.query(`
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE datname = '${testDbName}' AND pid <> pg_backend_pid();
        `);
    } catch (err) {
        console.log('No active connections to terminate or error:', err);
    }
    await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await adminClient.query(`CREATE DATABASE ${testDbName}`);
    await adminClient.end();

    // Set the new DATABASE_URL for the test environment
    urlObj.pathname = `/${testDbName}`;
    const testDbUrl = urlObj.toString();
    process.env.DATABASE_URL = testDbUrl;

    // We'll write this to a .env.test.worker file so the web server can pick it up
    const envTestPath = path.resolve(__dirname, '../.env.test.worker');
    fs.writeFileSync(envTestPath, `DATABASE_URL="${testDbUrl}"\n`);
    console.log(`📝 Wrote test environment variables to .env.test.worker`);

    console.log('🏗️  Pushing schema to test database...');
    // Run Drizzle push to create the schema
    execSync('npx drizzle-kit push --force', { 
        env: { ...process.env, DATABASE_URL: testDbUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('🏗️  Running metadata engine migrations...');
    const dbClient = new Client({ connectionString: testDbUrl });
    await dbClient.connect();
    try {
        const migrationsDir = path.resolve(__dirname, '../src/lib/db/migrations');
        const migrationFiles = [
            'metadata-foundation.sql',
            'seed-students-metadata.sql',
            'seed-staff-invoices.sql',
            'automation.sql'
        ];
        for (const file of migrationFiles) {
            const sqlPath = path.join(migrationsDir, file);
            if (fs.existsSync(sqlPath)) {
                console.log(`  Executing migration: ${file}`);
                const sql = fs.readFileSync(sqlPath, 'utf8');
                await dbClient.query(sql);
            }
        }
        console.log('✅ Metadata engine migrations complete!');
    } catch (e) {
        console.error('❌ Failed to run metadata engine migrations:', e);
    } finally {
        await dbClient.end();
    }

    console.log('🌱 Seeding test database...');
    // Run the standard seeder (which seeds tenants, users, students, etc.)
    execSync('npx tsx scripts/seed.ts', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('👤 Seeding E2E test users...');
    execSync('npx tsx scripts/run-e2e-sql.ts', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('✅ Global setup complete!\n');
}
