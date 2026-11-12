import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mockPoolConnect = jest.fn();
const mockPoolQuery = jest.fn();
const mockSqlFor = jest.fn();
const mockRunWithRlsBypass = jest.fn((_justification: string, fn: () => unknown) => fn());
const mockRunWithTenantContext = jest.fn((_tenantId: string, fn: () => unknown) => fn());
const mockSendWebhookRequest = jest.fn();
const mockEnqueueNotification = jest.fn();
const mockProcessDueNotifications = jest.fn();
const mockProcessNotification = jest.fn();

jest.mock('@/lib/db', () => ({
    pool: {
        connect: (...args: unknown[]) => mockPoolConnect(...args),
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
    RLS_BYPASS_JUSTIFICATIONS: {
        JOB_DISPATCH: 'job_dispatch',
        PLATFORM_EVENT_WRITE: 'platform_event_write',
        PLATFORM_INCIDENT_WRITE: 'platform_incident_write',
    },
    runWithRlsBypass: (justification: string, fn: () => unknown) =>
        mockRunWithRlsBypass(justification, fn),
    runWithTenantContext: (tenantId: string, fn: () => unknown) =>
        mockRunWithTenantContext(tenantId, fn),
    sqlFor: (...args: unknown[]) => mockSqlFor(...args),
}));

jest.mock('@/lib/integrations/webhook-security', () => ({
    sendWebhookRequest: (...args: unknown[]) => mockSendWebhookRequest(...args),
}));

jest.mock('@/lib/notifications/outbox', () => ({
    enqueueNotification: (...args: unknown[]) => mockEnqueueNotification(...args),
    processDueNotifications: (...args: unknown[]) => mockProcessDueNotifications(...args),
    processNotification: (...args: unknown[]) => mockProcessNotification(...args),
}));

jest.mock('@/lib/encryption', () => ({
    decryptFieldTolerant: (val: unknown) => val,
}));

import { dispatchDueJobs } from '@/lib/worker/dispatcher';
import { tasks } from '@/lib/worker/tasks';
import { POST as dispatchJobsPost } from '@/app/api/jobs/dispatch/route';
import { verifyTurnstileToken } from '@/lib/marketing/turnstile';
import {
    API_CONTENT_SECURITY_POLICY,
    apiSecurityHeaders,
    bearerUrlNoReferrerHeaders,
} from '@/lib/security/headers';
import { recordSreIncident } from '@/lib/observability/logger';

const REPO_ROOT = resolve(process.cwd(), '../..');
const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

describe('Security hardening: worker queues, tasks, headers, turnstile, SRE alerts & CI recovery', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('HIGH-13: dispatcher multi-queue drain & parameterized retry interval', () => {
        it('claims due jobs across all queues when queue is omitted', async () => {
            const executedSql: Array<{ sql: string; values: unknown[] }> = [];
            const release = jest.fn();
            mockPoolConnect.mockResolvedValue({ release });
            mockSqlFor.mockReturnValue(
                (strings: TemplateStringsArray, ...values: unknown[]) => {
                    const sql = strings.join('$PARAM$');
                    executedSql.push({ sql, values });
                    return Promise.resolve([]);
                },
            );

            const res = await dispatchDueJobs({ limit: 25 });
            expect(res.claimed).toBe(0);
            expect(release).toHaveBeenCalledTimes(1);

            const claimSql = executedSql.find((q) => q.sql.includes('WITH next_jobs AS'));
            expect(claimSql).toBeDefined();
            expect(claimSql!.sql).not.toContain('WHERE queue =');
        });

        it('filters by queue when an explicit queue name is passed', async () => {
            const executedSql: Array<{ sql: string; values: unknown[] }> = [];
            const release = jest.fn();
            mockPoolConnect.mockResolvedValue({ release });
            mockSqlFor.mockReturnValue(
                (strings: TemplateStringsArray, ...values: unknown[]) => {
                    const sql = strings.join('$PARAM$');
                    executedSql.push({ sql, values });
                    return Promise.resolve([]);
                },
            );

            await dispatchDueJobs({ queue: 'webhooks', limit: 15 });

            const claimSql = executedSql.find((q) => q.sql.includes('WITH next_jobs AS'));
            expect(claimSql).toBeDefined();
            expect(claimSql!.sql).toContain('WHERE queue =');
            expect(claimSql!.values).toContain('webhooks');
        });

        it('parameterizes make_interval(mins => $5::int) on failed job retry and injects tenantId for TENANT jobs', async () => {
            const release = jest.fn();
            mockPoolConnect.mockResolvedValue({ release });
            mockSqlFor.mockReturnValue(
                (strings: TemplateStringsArray) => {
                    const sql = strings.join('?');
                    if (sql.includes('WITH next_jobs AS')) {
                        return Promise.resolve([
                            {
                                id: 'job-bi-1',
                                tenantId: TENANT_ID,
                                scope: 'TENANT',
                                queue: 'default',
                                taskName: 'BI_SCHEDULED_REPORT',
                                payload: {
                                    reportId: 'rep-1',
                                    name: 'Daily Fee Digest',
                                    datasetId: 'fees',
                                    scheduleFrequency: 'DAILY',
                                    recipientEmail: 'principal@school.edu',
                                },
                                attempts: 0,
                                maxAttempts: 3,
                            },
                            {
                                id: 'job-fail-1',
                                tenantId: TENANT_ID,
                                scope: 'TENANT',
                                queue: 'webhooks',
                                taskName: 'nonexistent.task',
                                payload: { tenantId: TENANT_ID },
                                attempts: 0,
                                maxAttempts: 3,
                            },
                        ]);
                    }
                    return Promise.resolve([]);
                },
            );

            mockEnqueueNotification.mockResolvedValue({ notificationId: 'notif-123' });
            mockPoolQuery.mockImplementation((sqlText: string) => {
                if (sqlText.includes('INSERT INTO background_job_attempts')) {
                    return Promise.resolve({ rows: [{ id: 'attempt-1' }] });
                }
                return Promise.resolve({ rows: [], rowCount: 1 });
            });

            const summary = await dispatchDueJobs({});
            expect(summary.claimed).toBe(2);
            expect(summary.succeeded).toBe(1);
            expect(summary.failed).toBe(1);

            const retryQueryCall = mockPoolQuery.mock.calls.find(
                ([sqlText]) =>
                    typeof sqlText === 'string' &&
                    sqlText.includes('make_interval(mins => $5::int)'),
            );
            expect(retryQueryCall).toBeDefined();
            expect(retryQueryCall![1]).toEqual([
                'FAILED',
                1,
                'No task registered for nonexistent.task.',
                'job-fail-1',
                2,
            ]);
        });

        it('honors jobLimit and drains all queues in POST /api/jobs/dispatch', async () => {
            process.env.JOB_DISPATCH_SECRET = 'a'.repeat(40);
            const release = jest.fn();
            const claimValues: unknown[][] = [];
            mockPoolConnect.mockResolvedValue({ release });
            mockSqlFor.mockReturnValue(
                (strings: TemplateStringsArray, ...values: unknown[]) => {
                    if (strings.join('?').includes('WITH next_jobs AS')) {
                        claimValues.push(values);
                    }
                    return Promise.resolve([]);
                },
            );
            mockProcessDueNotifications.mockResolvedValue({
                processed: 0,
                succeeded: 0,
                failed: 0,
            });

            const req = new Request('https://school-sis-web.vercel.app/api/jobs/dispatch', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.JOB_DISPATCH_SECRET}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobLimit: 75, notificationLimit: 40 }),
            });

            const res = await dispatchJobsPost(req);
            expect(res.status).toBe(200);
            expect(claimValues[0]).toContain(75);
            expect(mockProcessDueNotifications).toHaveBeenCalledWith(40);
        });
    });

    describe('HIGH-13: registered worker tasks (BI_SCHEDULED_REPORT, workflow.follow_up_task, webhook.dispatch)', () => {
        it('registers and executes BI_SCHEDULED_REPORT, workflow.follow_up_task, and webhook.dispatch', async () => {
            expect(typeof tasks['BI_SCHEDULED_REPORT']).toBe('function');
            expect(typeof tasks['workflow.follow_up_task']).toBe('function');
            expect(typeof tasks['webhook.dispatch']).toBe('function');

            mockEnqueueNotification.mockResolvedValue({ notificationId: 'notif-follow-1' });
            mockPoolQuery.mockResolvedValue({
                rows: [{ email: 'admin@school.edu', emailEnc: null }],
                rowCount: 1,
            });

            const followUpResult = await tasks['workflow.follow_up_task']({
                tenantId: TENANT_ID,
                workflowId: 'wf-1',
                appointmentId: 'appt-1',
                objectName: 'admissions_leads',
                recordId: 'rec-1',
                title: 'Call prospective parent',
                dueDate: '2026-11-15',
            });
            expect(followUpResult).toEqual(
                expect.objectContaining({
                    processed: true,
                    tenantId: TENANT_ID,
                    queuedNotificationId: 'notif-follow-1',
                }),
            );

            process.env.WEBHOOK_SIGNING_SECRET = 'whsec_test_secret_at_least_16_chars';
            mockSendWebhookRequest.mockResolvedValue({
                ok: true,
                status: 202,
                body: 'accepted',
            });

            const webhookResult = await tasks['webhook.dispatch']({
                tenantId: TENANT_ID,
                workflowId: 'wf-2',
                url: 'https://hooks.example.org/scholarmind',
                method: 'POST',
                body: { event: 'lead.created', id: 'rec-1' },
            });
            expect(webhookResult).toEqual({
                delivered: true,
                tenantId: TENANT_ID,
                workflowId: 'wf-2',
                status: 202,
            });
            expect(mockSendWebhookRequest).toHaveBeenCalledWith(
                'https://hooks.example.org/scholarmind',
                JSON.stringify({ event: 'lead.created', id: 'rec-1' }),
                expect.objectContaining({
                    'content-type': 'application/json',
                    'x-school-sis-tenant-id': TENANT_ID,
                    'x-scholarmind-signature': expect.stringMatching(/^sha256=[0-9a-f]{64}$/),
                }),
                10_000,
                'POST',
            );
        });
    });

    describe('MED-12 / LOW-01: Turnstile fail-closed in production, headers & SRE alert webhook', () => {
        it('fails closed in production when TURNSTILE_SECRET_KEY is missing unless explicitly overridden', async () => {
            delete process.env.TURNSTILE_SECRET_KEY;
            delete process.env.PLAYWRIGHT_TEST;
            delete process.env.ALLOW_UNPROTECTED_PUBLIC_FORMS;
            Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });

            const prodResult = await verifyTurnstileToken('token_123');
            expect(prodResult).toEqual({ ok: false, reason: 'unconfigured' });

            process.env.ALLOW_UNPROTECTED_PUBLIC_FORMS = 'true';
            const overrideResult = await verifyTurnstileToken('token_123');
            expect(overrideResult).toEqual({ ok: true, reason: 'skipped' });
        });

        it('defines no-referrer headers for bearer URL routes and default-none CSP for /api/*', () => {
            expect(bearerUrlNoReferrerHeaders).toEqual([
                { key: 'Referrer-Policy', value: 'no-referrer' },
            ]);
            expect(API_CONTENT_SECURITY_POLICY).toBe("default-src 'none'; frame-ancestors 'none'");
            expect(apiSecurityHeaders).toEqual([
                { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
            ]);

            const nextConfigSource = readFileSync(resolve(REPO_ROOT, 'apps/web/next.config.ts'), 'utf8');
            expect(nextConfigSource).toContain("bodySizeLimit: '6mb'");
            expect(nextConfigSource).toContain("source: '/pay/:path*'");
            expect(nextConfigSource).toContain("source: '/verify/:path*'");
            expect(nextConfigSource).toContain("source: '/api/:path*'");
        });

        it('dispatches redacted SRE webhook alerts on CRITICAL/HIGH incidents and swallows webhook errors', async () => {
            process.env.SRE_ALERT_WEBHOOK_URL = 'https://alerts.example.org/incidents';
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            const fetchSpy = jest
                .spyOn(globalThis, 'fetch')
                .mockRejectedValueOnce(new Error('pager endpoint unreachable'));

            await expect(
                recordSreIncident({
                    tenantId: TENANT_ID,
                    severity: 'CRITICAL',
                    source: 'payments',
                    fingerprint: 'webhook_sig_failure',
                    title: 'Payment webhook critical failure',
                    metadata: {
                        apiKey: 'super_secret_api_key',
                        provider: 'razorpay',
                    },
                }),
            ).resolves.toBeUndefined();

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
            expect(calledUrl).toBe('https://alerts.example.org/incidents');
            const parsedBody = JSON.parse(String(calledInit?.body));
            expect(parsedBody.severity).toBe('CRITICAL');
            expect(parsedBody.metadata).toEqual({
                apiKey: '[Redacted]',
                provider: 'razorpay',
            });
            warnSpy.mockRestore();
            fetchSpy.mockRestore();
        });
    });

    describe('HIGH-12: vercel-recovery.mjs & CI/Docker shell-injection hardening', () => {
        it('rejects malformed commit SHAs, shell metacharacters, and invalid deployment targets in vercel-recovery.mjs', () => {
            const scriptPath = resolve(REPO_ROOT, 'scripts/vercel-recovery.mjs');
            const probeScript = `
                import assert from 'node:assert/strict';
                import { parseArgs, assertValidCommitSha, assertValidDeploymentTarget, report } from ${JSON.stringify(scriptPath)};

                assert.throws(() => assertValidCommitSha('abc123; rm -rf /'), /40-character hexadecimal/);
                assert.throws(() => assertValidCommitSha('not-a-40-char-sha'), /40-character hexadecimal/);
                assert.equal(assertValidCommitSha('a'.repeat(40)), 'a'.repeat(40));

                assert.throws(() => assertValidDeploymentTarget('dpl_bad;id'), /dpl_ deployment identifier/);
                assert.throws(() => assertValidDeploymentTarget('http://cleartext.example.com'), /dpl_ deployment identifier/);
                assert.equal(assertValidDeploymentTarget('dpl_ValidId123'), 'dpl_ValidId123');

                assert.throws(
                    () => parseArgs(['report', '--production-url', 'https://app.example.com', '--sha', '$(whoami)'], { VERCEL_TOKEN: 'tok' }),
                    /40-character hexadecimal/
                );
                assert.throws(
                    () => parseArgs(['guard-delete', '--production-url', 'https://app.example.com', '--deployment', 'dpl_ok', '--sha', 'shortsha'], { VERCEL_TOKEN: 'tok' }),
                    /40-character hexadecimal/
                );

                const res = await report(
                    parseArgs(['report', '--production-url', 'https://app.example.com'], { VERCEL_TOKEN: 'tok' }),
                    async () => ({
                        ok: true,
                        status: 200,
                        text: async () => JSON.stringify({
                            id: 'dpl_bad$(id)',
                            url: 'app.example.com',
                            readyState: 'READY',
                            meta: { githubCommitSha: 'bad;echo pwned' }
                        })
                    })
                );
                assert.equal(res.commit, '');
                assert.equal(res.safeId, '');
            `;

            execFileSync(process.execPath, ['--input-type=module', '-e', probeScript], {
                stdio: 'pipe',
            });
        });

        it('keeps deploy-production.yml and preview.yml run blocks free of ${{ ... }} interpolations and hardens WAHA compose', () => {
            for (const rel of [
                '.github/workflows/deploy-production.yml',
                '.github/workflows/preview.yml',
            ]) {
                const lines = readFileSync(resolve(REPO_ROOT, rel), 'utf8').split('\n');
                let inRun = false;
                let runIndent = 0;
                const violations: string[] = [];

                lines.forEach((line, idx) => {
                    const match = /^(\s*)run:\s*(.*)$/.exec(line);
                    if (match) {
                        inRun = true;
                        runIndent = match[1].length;
                        if (match[2].includes('${{')) {
                            violations.push(`${rel}:${idx + 1}`);
                        }
                        if (match[2] && !/^[>|]/.test(match[2].trim())) {
                            inRun = false;
                        }
                        return;
                    }
                    if (inRun) {
                        if (line.trim() === '') return;
                        const indent = (line.match(/^\s*/)?.[0] ?? '').length;
                        if (indent <= runIndent) {
                            inRun = false;
                            return;
                        }
                        if (line.includes('${{')) {
                            violations.push(`${rel}:${idx + 1}`);
                        }
                    }
                });

                expect(violations).toEqual([]);
            }

            const wahaCompose = readFileSync(
                resolve(REPO_ROOT, 'docker-compose.whatsapp-free.yml'),
                'utf8',
            );
            expect(wahaCompose).toContain("'127.0.0.1:3005:3000'");
            expect(wahaCompose).not.toContain(':latest');
            expect(wahaCompose).toContain('WAHA_API_KEY:?');
            expect(wahaCompose).toContain('WHATSAPP_WEBHOOK_SECRET:?');
            expect(wahaCompose).toContain('WAHA_DASHBOARD_PASSWORD:?');
            expect(wahaCompose).toContain('no-new-privileges:true');
            expect(wahaCompose).toContain('- ALL');
        });
    });
});
