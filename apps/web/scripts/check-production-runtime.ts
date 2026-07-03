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
const TENANT_HOST_PATTERN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

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

function issueForStrict(level: Issue['level'] = 'error'): Issue['level'] {
    return strict ? level : 'warning';
}

function isLocalHost(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function looksLikePlaceholder(value: string): boolean {
    const lowered = value.trim().toLowerCase();
    if (!lowered) return true;

    return (
        lowered.includes('mock') ||
        lowered.includes('dummy') ||
        lowered.includes('placeholder') ||
        lowered.includes('changeme') ||
        lowered.includes('change-me') ||
        lowered.includes('change_me') ||
        lowered.includes('build-time') ||
        lowered.includes('test-secret') ||
        lowered === 'test' ||
        lowered === 'dev' ||
        lowered === 'local' ||
        lowered === 'dev-secret' ||
        /^x{16,}$/i.test(value) ||
        /^0{16,}$/.test(value)
    );
}

function validateNonPlaceholder(name: string, value: string) {
    if (strict && looksLikePlaceholder(value)) {
        add('error', `${name} must not use mock, dummy, test, placeholder, or development values in production.`);
    }
}

function requireProductionValue(
    name: string,
    options: { minLength?: number; prefixes?: string[]; label?: string } = {},
): string | null {
    const minLength = options.minLength ?? 1;
    const value = process.env[name];
    if (!value || value.length < minLength) {
        add(issueForStrict(), `${name} must be set${minLength > 1 ? ` and at least ${minLength} characters` : ''}.`);
        return null;
    }

    validateNonPlaceholder(name, value);
    if (strict && options.prefixes && !options.prefixes.some((prefix) => value.startsWith(prefix))) {
        add('error', `${name} must use a production ${options.label || 'value'} prefix: ${options.prefixes.join(', ')}.`);
    }
    return value;
}

function requireOneProductionSecret(names: string[], minLength = 32) {
    const configured = names
        .map((name) => ({ name, value: process.env[name] }))
        .find(({ value }) => Boolean(value && value.length >= minLength));

    if (!configured?.value) {
        add(issueForStrict(), `One of ${names.join(', ')} must be set and at least ${minLength} characters.`);
        return;
    }

    validateNonPlaceholder(configured.name, configured.value);
}

function parseHttpsUrl(name: string, value: string): URL | null {
    try {
        const parsed = new URL(value);
        if (strict && parsed.protocol !== 'https:') {
            add('error', `${name} must use https:// in production.`);
        }
        if (strict && isLocalHost(parsed.hostname)) {
            add('error', `${name} must not point to localhost in production.`);
        }
        return parsed;
    } catch {
        add(issueForStrict(), `${name} must be a valid URL.`);
        return null;
    }
}

function requireHttpsUrl(name: string): URL | null {
    const value = process.env[name];
    if (!value) {
        add(issueForStrict(), `${name} must be set.`);
        return null;
    }
    return parseHttpsUrl(name, value);
}

function validateOptionalHttpsUrl(name: string, value: string | undefined) {
    if (!value) return;
    parseHttpsUrl(name, value);
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

function parseList(name: string): string[] {
    return (process.env[name] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function validateTenantBaseHosts() {
    const hosts = parseList('TENANT_BASE_HOSTS');
    if (hosts.length === 0) {
        add(issueForStrict(), 'TENANT_BASE_HOSTS must list the production tenant base domains.');
        return;
    }

    for (const rawHost of hosts) {
        if (rawHost.includes('://') || rawHost.includes('/')) {
            add('error', `TENANT_BASE_HOSTS entries must be hostnames only; '${rawHost}' includes a protocol or path.`);
            continue;
        }

        const hostname = rawHost.replace(/:\d+$/, '').toLowerCase();
        if (strict && isLocalHost(hostname)) {
            add('error', `TENANT_BASE_HOSTS must not include localhost in production: ${rawHost}.`);
        }
        if (rawHost.includes('*')) {
            add('error', `TENANT_BASE_HOSTS must not use wildcards: ${rawHost}.`);
        }
        if (strict && !TENANT_HOST_PATTERN.test(hostname)) {
            add('error', `TENANT_BASE_HOSTS entry '${rawHost}' must be a production domain such as school.example.edu.`);
        }
    }
}

function requirePositiveInteger(name: string) {
    const value = process.env[name];
    const parsed = Number(value);
    if (!value || !Number.isInteger(parsed) || parsed <= 0) {
        add(issueForStrict(), `${name} must be a positive integer.`);
    }
}

function validateIsoDate(name: string, level: Issue['level']) {
    const value = process.env[name];
    if (!value) {
        add(level, `${name} is not set; record restore-drill evidence before launch.`);
        return;
    }
    if (Number.isNaN(Date.parse(value))) {
        add(level, `${name} must be an ISO date/time when restore-drill evidence is recorded.`);
    }
}

function validateNotificationProviders() {
    const requiredChannels = parseList('REQUIRED_NOTIFICATION_CHANNELS');
    const channels = new Set(
        (strict && requiredChannels.length === 0 ? ['email', 'sms'] : requiredChannels)
            .map((channel) => channel.toLowerCase()),
    );

    if (channels.has('none')) return;

    if (channels.has('email')) {
        const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
        if (!['smtp', 'resend'].includes(provider)) {
            add(issueForStrict(), 'EMAIL_PROVIDER must be smtp or resend for required production email delivery.');
        } else if (provider === 'resend') {
            requireProductionValue('RESEND_API_KEY', { minLength: 16 });
        } else {
            requireProductionValue('SMTP_HOST');
            requireProductionValue('SMTP_USER');
            requireProductionValue('SMTP_PASS', { minLength: 16 });
        }
    }

    if (channels.has('sms')) {
        const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
        if (!['msg91', 'twilio'].includes(provider)) {
            add(issueForStrict(), 'SMS_PROVIDER must be msg91 or twilio for required production SMS delivery.');
        } else if (provider === 'msg91') {
            requireProductionValue('MSG91_AUTH_KEY', { minLength: 16 });
        } else {
            requireProductionValue('TWILIO_ACCOUNT_SID', { minLength: 16, prefixes: ['AC'], label: 'account SID' });
            requireProductionValue('TWILIO_AUTH_TOKEN', { minLength: 16 });
            requireProductionValue('TWILIO_FROM_NUMBER');
        }
    }

    if (channels.has('whatsapp')) {
        add('error', 'WHATSAPP_PROVIDER is still mock-only in the outbox dispatcher; remove whatsapp from REQUIRED_NOTIFICATION_CHANNELS until a real provider is wired.');
    } else if (strict && (process.env.WHATSAPP_PROVIDER || 'mock') === 'mock') {
        add('warning', 'WHATSAPP_PROVIDER is mock; keep WhatsApp out of launch scope or wire a real provider.');
    }

    if (channels.has('push')) {
        if (process.env.PUSH_PROVIDER !== 'firebase') {
            add(issueForStrict(), 'PUSH_PROVIDER must be firebase for required production push delivery.');
        }
        requireProductionValue('FIREBASE_PROJECT_ID');
        requireProductionValue('FIREBASE_CLIENT_EMAIL');
        requireProductionValue('FIREBASE_PRIVATE_KEY', { minLength: 16 });
    } else if (strict && (process.env.PUSH_PROVIDER || 'mock') === 'mock') {
        add('warning', 'PUSH_PROVIDER is mock; keep push notifications out of launch scope or wire Firebase.');
    }
}

function validatePaymentProviders() {
    if (!strict) return;

    requireProductionValue('STRIPE_SECRET_KEY', { minLength: 16, prefixes: ['sk_live_'], label: 'secret key' });
    requireProductionValue('STRIPE_WEBHOOK_SECRET', { minLength: 16, prefixes: ['whsec_'], label: 'webhook secret' });
    if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
        requireProductionValue('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', { minLength: 16, prefixes: ['pk_live_'], label: 'publishable key' });
    }

    requireProductionValue('RAZORPAY_KEY_ID', { minLength: 8, prefixes: ['rzp_live_'], label: 'key id' });
    requireProductionValue('RAZORPAY_KEY_SECRET', { minLength: 16 });
    requireProductionValue('RAZORPAY_WEBHOOK_SECRET', { minLength: 16 });
}

function validateAgentService() {
    const agentEnabled = ['AI_FEATURES_ENABLED', 'AGENT_FEATURES_ENABLED'].some((name) => process.env[name] === 'true')
        || Boolean(process.env.AGENT_SERVICE_URL || process.env.AGENT_BASE_URL);

    if (!agentEnabled) {
        if (strict) add('warning', 'Agent service is not configured; keep AI agent routes out of launch scope.');
        return;
    }

    requireHttpsUrl(process.env.AGENT_SERVICE_URL ? 'AGENT_SERVICE_URL' : 'AGENT_BASE_URL');
    requireProductionValue('AGENT_API_TOKEN', { minLength: 32 });
    requireProductionValue('AGENT_WEBHOOK_SECRET', { minLength: 32 });
}

const appVercel = readJson('apps/web/vercel.json');
let hasJobDispatchCron = false;
if (!appVercel) {
    add('error', 'apps/web/vercel.json is required because the Vercel project root is apps/web.');
} else {
    if (appVercel.buildCommand !== 'pnpm --filter @school-sis/web run build') {
        add('error', 'apps/web/vercel.json must build @school-sis/web.');
    }
    if (!Array.isArray(appVercel.regions) || appVercel.regions.length === 0) {
        add('warning', 'apps/web/vercel.json should pin at least one primary serverless region.');
    }
    if (Array.isArray(appVercel.crons)) {
        hasJobDispatchCron = appVercel.crons.some((cron: { path?: string }) => cron.path === '/api/jobs/dispatch');
        for (const cron of appVercel.crons as Array<{ path?: string; schedule?: string }>) {
            if (!cron.path?.startsWith('/')) {
                add('error', 'Every apps/web/vercel.json cron path must start with /.');
            }
            if (!cron.schedule || typeof cron.schedule !== 'string') {
                add('error', `Cron ${cron.path || '<missing path>'} must define a schedule string.`);
            }
            if (cron.path === '/api/jobs/dispatch' && cron.schedule !== '* * * * *') {
                add(
                    'warning',
                    'The /api/jobs/dispatch cron is not minute-level. Use Vercel Pro or an external scheduler for production-grade job dispatch.',
                );
            }
        }
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
    requireProductionValue('SESSION_SECRET', { minLength: 32 });
    requireProductionValue('METRICS_TOKEN', { minLength: 32 });
    requireProductionValue('JOB_DISPATCH_SECRET', { minLength: 32 });
    requireOneProductionSecret(['PII_ENCRYPTION_KEY', 'ENCRYPTION_KEY'], 32);
    requireHttpsUrl('NEXT_PUBLIC_APP_URL');
    validateTenantBaseHosts();
    validatePaymentProviders();
    validateNotificationProviders();
    validateAgentService();

    if (hasJobDispatchCron) {
        requireProductionValue('CRON_SECRET', { minLength: 32 });
    } else if (process.env.EXTERNAL_JOB_SCHEDULER_URL) {
        requireHttpsUrl('EXTERNAL_JOB_SCHEDULER_URL');
    } else {
        add('error', 'Configure Vercel Cron for /api/jobs/dispatch or set EXTERNAL_JOB_SCHEDULER_URL before launch.');
    }
}

const r2Configured = hasAll(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);
const s3Configured = hasAll(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET']);

if (!r2Configured && !s3Configured) {
    add(strict ? 'error' : 'warning', 'Storage is not configured. Set Cloudflare R2 or AWS S3 credentials.');
}

const cdnBaseUrl = process.env.STORAGE_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL;
validateOptionalHttpsUrl('STORAGE_CDN_BASE_URL/R2_PUBLIC_BASE_URL', cdnBaseUrl);

if (strict) {
    requirePositiveInteger('BACKUP_RETENTION_DAYS');
    validateIsoDate('BACKUP_RESTORE_DRILL_AT', 'warning');
}

const upstashConfigured = hasAll(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
if (!upstashConfigured) {
    add('warning', 'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set; auth rate limiting will use the shared Postgres fallback.');
}

if (strict && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    add('warning', 'NEXT_PUBLIC_SENTRY_DSN is not set; production error tracking remains a launch-readiness gap.');
}

if (process.env.RATE_LIMIT_BACKEND && !['postgres'].includes(process.env.RATE_LIMIT_BACKEND)) {
    add('warning', 'RATE_LIMIT_BACKEND only supports postgres as an explicit override when Upstash is not configured.');
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
