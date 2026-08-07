import { execFileSync } from 'child_process';
import path from 'path';
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

    console.log('🏗️  Applying migrations to test database...');
    execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('🌱 Seeding test database...');
    // Run the standard seeder (which seeds tenants, users, students, etc.)
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/seed.ts'], {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('👤 Seeding E2E test users...');
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/run-e2e-sql.ts'], {
        env: { ...process.env, DATABASE_URL: environment.databaseUrl },
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('✅ Global setup complete!\n');
}
