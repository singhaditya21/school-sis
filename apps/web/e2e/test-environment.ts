import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const FALLBACK_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/school_sis';
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export type TestEnvironment = {
    databaseName: string;
    databaseUrl: string;
    adminDatabaseUrl: string;
    envFilePath: string;
};

function sanitizeDatabaseName(value: string): string {
    const sanitized = value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    const withPrefix = /^[a-z_]/.test(sanitized) ? sanitized : `test_${sanitized}`;
    return withPrefix.slice(0, 63) || 'school_sis_test';
}

function defaultDatabaseName(baseName: string): string {
    if (process.env.TEST_DATABASE_NAME) return process.env.TEST_DATABASE_NAME;
    if (!process.env.CI) return baseName;

    const parts = [
        baseName,
        process.env.GITHUB_RUN_ID,
        process.env.GITHUB_RUN_ATTEMPT,
        process.env.TEST_DATABASE_SUFFIX,
    ].filter(Boolean);
    return parts.join('_');
}

function assertSafeDatabaseName(databaseName: string): void {
    if (!SAFE_IDENTIFIER_RE.test(databaseName)) {
        throw new Error(`Unsafe test database name: ${databaseName}`);
    }
}

function withDatabaseName(connectionString: string, databaseName: string): string {
    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    return url.toString();
}

function withAdminDatabase(connectionString: string): string {
    const url = new URL(connectionString);
    url.pathname = '/postgres';
    return url.toString();
}

export function ensurePlaywrightTestEnvironment(options: {
    envFileName: string;
    defaultDatabaseName: string;
}): TestEnvironment {
    const databaseName = sanitizeDatabaseName(defaultDatabaseName(options.defaultDatabaseName));
    assertSafeDatabaseName(databaseName);

    const baseDatabaseUrl = process.env.DATABASE_URL || FALLBACK_DATABASE_URL;
    const databaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
    const adminDatabaseUrl = withAdminDatabase(baseDatabaseUrl);
    const envFilePath = path.resolve(__dirname, '..', options.envFileName);

    const envLines = [
        `DATABASE_URL="${databaseUrl}"`,
        `DIRECT_URL="${databaseUrl}"`,
        'SESSION_SECRET="test-session-secret-32-characters"',
        'NEXTAUTH_SECRET="test-nextauth-secret-32-characters"',
        'ENCRYPTION_KEY="test-encryption-key-32-characters"',
        'PII_ENCRYPTION_KEY="test-pii-encryption-key-32-characters"',
        'JOB_QUEUE_MODE="database"',
        'EMAIL_PROVIDER="mock"',
        'SMS_PROVIDER="mock"',
        'WHATSAPP_PROVIDER="mock"',
        'PUSH_PROVIDER="mock"',
        '',
    ];

    fs.writeFileSync(envFilePath, envLines.join('\n'));
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;

    return { databaseName, databaseUrl, adminDatabaseUrl, envFilePath };
}

export async function recreateDatabase(environment: TestEnvironment): Promise<void> {
    const client = new Client({ connectionString: environment.adminDatabaseUrl });
    await client.connect();
    try {
        await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [
            environment.databaseName,
        ]);
        await client.query(`DROP DATABASE IF EXISTS "${environment.databaseName}"`);
        await client.query(`CREATE DATABASE "${environment.databaseName}"`);
    } finally {
        await client.end();
    }
}

export async function dropDatabase(environment: TestEnvironment): Promise<void> {
    const client = new Client({ connectionString: environment.adminDatabaseUrl });
    await client.connect();
    try {
        await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [
            environment.databaseName,
        ]);
        await client.query(`DROP DATABASE IF EXISTS "${environment.databaseName}"`);
    } finally {
        await client.end();
    }
}
