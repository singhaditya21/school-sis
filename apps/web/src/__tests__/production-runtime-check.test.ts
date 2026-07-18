import path from 'node:path';
import { spawnSync } from 'node:child_process';

const appRoot = path.resolve(__dirname, '../..');
const tsxBin = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function runInfraCheck(env: Record<string, string>, args = ['--strict']) {
    return spawnSync(tsxBin, ['scripts/check-production-runtime.ts', ...args], {
        cwd: appRoot,
        env: {
            CI: '1',
            HOME: process.env.HOME || '',
            PATH: process.env.PATH || '',
            TMPDIR: process.env.TMPDIR || '/tmp',
            ...env,
        },
        encoding: 'utf8',
    });
}

// The complete must-have set: a lean deploy with no optional capabilities.
function minimalValidEnv(): Record<string, string> {
    return {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://runtime:rtpass123@ep-blue-pooler.ap-south-1.aws.neon.tech/school?sslmode=require',
        DIRECT_URL: 'postgresql://migrator:mgpass123@ep-blue.ap-south-1.aws.neon.tech/school?sslmode=require',
        SESSION_SECRET: 'session-runtime-token-20260703-value',
        JOB_DISPATCH_SECRET: 'job-dispatch-token-20260703-value',
        CRON_SECRET: 'cron-dispatch-token-20260703-value',
        PII_ENCRYPTION_KEY: 'pii-encryption-key-20260703-value',
        NEXT_PUBLIC_APP_URL: 'https://school-sis-web.vercel.app',
        TENANT_BASE_HOSTS: 'school-sis-web.vercel.app,academy.school.edu',
    };
}

// A fully-configured deploy with all optional capabilities enabled.
function productionLikeEnv(): Record<string, string> {
    return {
        ...minimalValidEnv(),
        NODE_ENV: 'test',
        METRICS_TOKEN: 'metrics-runtime-token-20260703-value',
        NEXT_PUBLIC_SENTRY_DSN: 'https://abc123@o0.ingest.sentry.io/1',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
        STRIPE_WEBHOOK_SECRET: `whsec_${'b'.repeat(32)}`,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_${'c'.repeat(32)}`,
        REQUIRED_NOTIFICATION_CHANNELS: 'email,sms',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: `re_${'d'.repeat(32)}`,
        SMS_PROVIDER: 'twilio',
        TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`,
        TWILIO_AUTH_TOKEN: 'twilio-auth-token-20260703-value',
        TWILIO_FROM_NUMBER: '+15555550100',
        R2_ACCOUNT_ID: 'r2-account-20260703',
        R2_ACCESS_KEY_ID: 'r2-access-key-20260703',
        R2_SECRET_ACCESS_KEY: 'r2-secret-key-20260703-value',
        R2_BUCKET_NAME: 'school-sis-assets',
        STORAGE_CDN_BASE_URL: 'https://cdn.school.edu',
        BACKUP_RETENTION_DAYS: '30',
        BACKUP_RESTORE_DRILL_AT: '2026-07-03T00:00:00.000Z',
        UPSTASH_REDIS_REST_URL: 'https://upstash.school.edu',
        UPSTASH_REDIS_REST_TOKEN: 'upstash-token-20260703-value',
    };
}

describe('production runtime contract check', () => {
    it('fails strict mode when a REQUIRED var (tenant hosts / cron secret) is missing', () => {
        const env = minimalValidEnv();
        delete env.TENANT_BASE_HOSTS;
        delete env.CRON_SECRET;
        const result = runInfraCheck(env);
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.status).toBe(1);
        expect(output).toContain('TENANT_BASE_HOSTS');
        expect(output).toContain('CRON_SECRET');
    });

    it('a lean deploy (only the required vars, no optional capabilities) passes strict mode', () => {
        const result = runInfraCheck(minimalValidEnv());
        const output = `${result.stdout}\n${result.stderr}`;

        expect(output).toContain('[infra] Production runtime contract check passed.');
        expect(result.status).toBe(0);
    });

    it('requires ONLY the selected payment provider secrets when payments are enabled', () => {
        const result = runInfraCheck({ ...minimalValidEnv(), PAYMENT_PROVIDER: 'stripe' });
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.status).toBe(1);
        expect(output).toContain('STRIPE_SECRET_KEY');
        // The other provider must NOT be demanded.
        expect(output).not.toContain('RAZORPAY_KEY_ID');
    });

    it('passes strict mode with a fully-configured (all capabilities) production-like env', () => {
        const result = runInfraCheck(productionLikeEnv());
        const output = `${result.stdout}\n${result.stderr}`;

        expect(output).toContain('[infra] Production runtime contract check passed.');
        expect(result.status).toBe(0);
    });
});
