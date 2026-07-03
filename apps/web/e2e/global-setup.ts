import { execSync } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';
import {
    enableVectorExtension,
    ensurePlaywrightTestEnvironment,
    recreateDatabase,
} from './test-environment';

export default async function globalSetup() {
    console.log('\n🚀 [Test Setup] Initializing isolated database environment...');

    const environment = ensurePlaywrightTestEnvironment({
        envFileName: '.env.test',
        defaultDatabaseName: 'school_sis_test',
    });
    console.log(`📦 Recreating test database: ${environment.databaseName}`);
    await recreateDatabase(environment);
    console.log('🧩 Enabling vector extension in test database...');
    await enableVectorExtension(environment);
    console.log(`📝 Wrote test environment variables to ${path.basename(environment.envFilePath)}`);

    console.log('🏗️  Pushing schema to test database...');
    // Run Drizzle push to create the schema
    execSync('npx drizzle-kit push --force', { 
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('🌱 Seeding test database...');
    // Run the standard seeder (which seeds tenants, users, students, etc.)
    execSync('npx tsx scripts/seed.ts', {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('🏗️  Running metadata engine migrations...');
    const dbClient = new Client({ connectionString: environment.databaseUrl });
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

    console.log('👤 Seeding E2E test users...');
    execSync('npx tsx scripts/run-e2e-sql.ts', {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('✅ Global setup complete!\n');
}
