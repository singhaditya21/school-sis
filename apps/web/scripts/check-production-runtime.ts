import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Issue = {
    level: 'error' | 'warning';
    message: string;
};

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict') || process.env.NODE_ENV === 'production';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const issues: Issue[] = [];

function add(level: Issue['level'], message: string) {
    issues.push({ level, message });
}

function fileExists(relativePath: string): boolean {
    return fs.existsSync(path.join(repoRoot, relativePath));
}

function readJson(relativePath: string): any | null {
    try {
        return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
    } catch {
        return null;
    }
}

function requireValue(name: string, minLength = 1) {
    const value = process.env[name];
    if (!value || value.length < minLength) {
        add(strict ? 'error' : 'warning', `${name} must be set${minLength > 1 ? ` and at least ${minLength} characters` : ''}.`);
    }
}

function isLocalHost(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function parseDatabaseUrl(name: string): URL | null {
    const value = process.env[name];
    if (!value) {
        add(strict ? 'error' : 'warning', `${name} is not set.`);
        return null;
    }

    try {
        const parsed = new URL(value);
        if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
            add('error', `${name} must use postgres:// or postgresql://.`);
        }
        return parsed;
    } catch {
        add('error', `${name} is not a valid database URL.`);
        return null;
    }
}

function checkDatabaseUrl(name: string, options: { direct: boolean }) {
    const parsed = parseDatabaseUrl(name);
    if (!parsed) return;

    const sslMode = parsed.searchParams.get('sslmode');
    if (sslMode === 'disable') {
        add('error', `${name} must not disable SSL.`);
    }

    if (!isLocalHost(parsed.hostname) && sslMode !== 'require' && sslMode !== 'verify-full') {
        add(strict ? 'error' : 'warning', `${name} should include sslmode=require or sslmode=verify-full.`);
    }

    if (!isLocalHost(parsed.hostname) && !parsed.hostname.includes('neon.tech')) {
        add('warning', `${name} does not look like a Neon hostname. Confirm this is intentional.`);
    }

    const isPooler = parsed.hostname.includes('-pooler.');
    if (options.direct && isPooler) {
        add('error', `${name} must be the direct Neon connection string, not the pooler.`);
    }
}

function hasAll(names: string[]): boolean {
    return names.every((name) => Boolean(process.env[name]));
}

const appVercel = readJson('apps/web/vercel.json');
if (!appVercel) {
    add('error', 'apps/web/vercel.json is required because the Vercel project root is apps/web.');
} else {
    if (appVercel.buildCommand !== 'pnpm --filter @school-sis/web run build') {
        add('error', 'apps/web/vercel.json must build @school-sis/web.');
    }
    if (!Array.isArray(appVercel.regions) || appVercel.regions.length === 0) {
        add('warning', 'apps/web/vercel.json should pin at least one primary serverless region.');
    }
}

if (fileExists('vercel.json')) {
    add('error', 'Root vercel.json should not exist; Vercel is configured with apps/web as the project root.');
}

const rootProject = readJson('.vercel/project.json');
if (rootProject && rootProject.projectName !== 'school-sis-web') {
    add('warning', `Root .vercel project is '${rootProject.projectName}', expected 'school-sis-web'.`);
}

if (fileExists('render.yaml')) {
    add('error', 'render.yaml should not exist in the Vercel/Neon production contract.');
}

if (fileExists('apps/web/.vercel/project.json')) {
    add('warning', 'apps/web/.vercel exists locally. Deploy from the repository root to avoid the stale web project.');
}

const rootPackage = readJson('package.json');
const rootScripts = rootPackage?.scripts || {};
for (const [name, command] of Object.entries(rootScripts)) {
    if (typeof command === 'string' && command.includes('prisma')) {
        add('error', `Root script ${name} still references Prisma. Use Drizzle scripts only.`);
    }
}

checkDatabaseUrl('DATABASE_URL', { direct: false });

if (process.env.DIRECT_URL || strict) {
    checkDatabaseUrl('DIRECT_URL', { direct: true });
}

if (strict) {
    requireValue('SESSION_SECRET', 32);
    if (!process.env.PII_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
        add('error', 'PII_ENCRYPTION_KEY or ENCRYPTION_KEY must be set.');
    }
    requireValue('NEXT_PUBLIC_APP_URL');
}

const r2Configured = hasAll(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);
const s3Configured = hasAll(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET']);

if (!r2Configured && !s3Configured) {
    add(strict ? 'error' : 'warning', 'Storage is not configured. Set Cloudflare R2 or AWS S3 credentials.');
}

const cdnBaseUrl = process.env.STORAGE_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL;
if (cdnBaseUrl && !cdnBaseUrl.startsWith('https://')) {
    add('error', 'STORAGE_CDN_BASE_URL/R2_PUBLIC_BASE_URL must use https://.');
}

if (strict && !process.env.BACKUP_RETENTION_DAYS) {
    add('warning', 'BACKUP_RETENTION_DAYS is not set; default retention runbook applies.');
}

const errors = issues.filter((issue) => issue.level === 'error');
for (const issue of issues) {
    const prefix = issue.level === 'error' ? '[infra:error]' : '[infra:warn]';
    console.log(`${prefix} ${issue.message}`);
}

if (errors.length > 0) {
    process.exitCode = 1;
} else {
    console.log('[infra] Production runtime contract check passed.');
}
