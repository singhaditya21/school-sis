import { execSync } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';
import {
    ensurePlaywrightTestEnvironment,
    recreateDatabase,
} from './test-environment';

export default async function globalSetup() {
    console.log('\n🚀 [Test Setup] Initializing isolated database environment (Worker)...');

    const environment = ensurePlaywrightTestEnvironment({
        envFileName: '.env.test.worker',
        defaultDatabaseName: 'school_sis_test_worker',
    });
    console.log(`📦 Recreating test database: ${environment.databaseName}`);
    await recreateDatabase(environment);
    console.log(`📝 Wrote test environment variables to ${path.basename(environment.envFilePath)}`);

    console.log('🏗️  Pushing schema to test database...');
    // Run Drizzle push to create the schema
    execSync('npx drizzle-kit push --force', { 
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

    console.log('🌱 Seeding test database...');
    // Run the standard seeder (which seeds tenants, users, students, etc.)
    execSync('npx tsx scripts/seed.ts', {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('👤 Seeding E2E test users...');
    execSync('npx tsx scripts/run-e2e-sql.ts', {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('🏢 Setting up Greenwood International School Company Context (Worker)...');
    const greenwoodClient = new Client({ connectionString: environment.databaseUrl });
    await greenwoodClient.connect();
    try {
        const { rows: companyRows } = await greenwoodClient.query(`
            INSERT INTO companies (name, subscription_tier, is_active, active_modules) 
            VALUES ('Greenwood International School Org', 'ENTERPRISE', true, '{"ATTENDANCE","FEES","COMMUNICATION","AI_AGENTS"}') 
            RETURNING id
        `);
        const companyId = companyRows[0].id;
        await greenwoodClient.query(`
            UPDATE tenants 
            SET company_id = $1 
            WHERE id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'
        `, [companyId]);
        console.log('✅ Greenwood Company Context bound successfully!');
    } catch (err) {
        console.error('❌ Failed to setup Greenwood Company Context:', err);
    } finally {
        await greenwoodClient.end();
    }

    console.log('✅ Global setup complete!\n');
}
