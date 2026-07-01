import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DIRECT_URL;

if (!databaseUrl) {
    throw new Error('DIRECT_URL is required to create a database backup.');
}

const outputDir = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups', 'neon'));
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join(outputDir, `school-sis-${timestamp}.dump`);

fs.mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
    'pg_dump',
    [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        outputFile,
        databaseUrl,
    ],
    { stdio: 'inherit' },
);

if (result.error) {
    throw result.error;
}

if (result.status !== 0) {
    process.exit(result.status || 1);
}

console.log(`[backup] Created ${outputFile}`);
