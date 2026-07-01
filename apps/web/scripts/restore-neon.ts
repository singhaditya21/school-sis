import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DIRECT_URL;
const backupFile = process.argv[2];

if (!databaseUrl) {
    throw new Error('DIRECT_URL is required to restore a database backup.');
}

if (!backupFile || !fs.existsSync(backupFile)) {
    throw new Error('Pass an existing backup file path: pnpm backup:restore -- ./backups/neon/file.dump');
}

if (process.env.CONFIRM_RESTORE !== 'school-sis') {
    throw new Error('Restore is destructive. Set CONFIRM_RESTORE=school-sis to continue.');
}

const result = spawnSync(
    'pg_restore',
    [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        databaseUrl,
        backupFile,
    ],
    { stdio: 'inherit' },
);

if (result.error) {
    throw result.error;
}

if (result.status !== 0) {
    process.exit(result.status || 1);
}

console.log(`[restore] Restored ${backupFile}`);
