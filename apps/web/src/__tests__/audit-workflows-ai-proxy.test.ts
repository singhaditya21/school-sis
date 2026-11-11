import { NextRequest } from 'next/server';

const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn(async () => ({
    query: mockClientQuery,
    release: mockClientRelease,
}));
const mockRunWithTenantContext = jest.fn(async (_tenantId: string, fn: () => Promise<unknown>) => fn());
const mockRunWithRlsBypass = jest.fn(async (_justification: unknown, fn: () => Promise<unknown>) => fn());
const mockGetIronSession = jest.fn();

jest.mock('iron-session', () => ({
    getIronSession: (...args: unknown[]) => mockGetIronSession(...args),
}));

jest.mock('@/lib/db', () => {
    const actualSql = jest.requireActual('../../../../packages/api/src/db/sql') as typeof import('../../../../packages/api/src/db/sql');
    return {
        ...actualSql,
        pool: {
            query: (...args: unknown[]) => mockPoolQuery(...args),
            connect: () => mockPoolConnect(),
        },
        sql: actualSql.createSqlTag(() => ({
            query: (...args: unknown[]) => mockPoolQuery(...args),
        })),
        runWithTenantContext: (tenantId: string, fn: () => Promise<unknown>) => mockRunWithTenantContext(tenantId, fn),
        runWithRlsBypass: (justification: unknown, fn: () => Promise<unknown>) => mockRunWithRlsBypass(justification, fn),
        RLS_BYPASS_JUSTIFICATIONS: {
            JOB_DISPATCH: 'JOB_DISPATCH',
            NOTIFICATION_SWEEP: 'NOTIFICATION_SWEEP',
            NOTIFICATION_RECEIPT: 'NOTIFICATION_RECEIPT',
            PLATFORM_EVENT_WRITE: 'PLATFORM_EVENT_WRITE',
            PLATFORM_INCIDENT_WRITE: 'PLATFORM_INCIDENT_WRITE',
            PLATFORM_METRICS: 'PLATFORM_METRICS',
            OPERATIONAL_SNAPSHOT: 'OPERATIONAL_SNAPSHOT',
        },
    };
});

import {
    UUID_RE,
    WorkflowApprovalError,
    createWorkflowApprovalRequest,
    requireApprovedWorkflowApprovalOrRequest,
    reviewPersistedWorkflowApprovalRequest,
    reviewWorkflowApprovalRequest,
} from '../../../../packages/api/src/workflows/approvals';
import { TenantScope, eq } from '@school-sis/api/src/data';
import type { SqlRunner } from '@school-sis/api/src/db/sql';
import { feeComponents, feePlans, invoices } from '@school-sis/api/src/db/generated/tables';
import { proxy, config as proxyConfig } from '@/proxy';
import { createContentSecurityPolicy, createCspNonce } from '@/lib/security/headers';
import { AiTenantScopeError, auditTenantScopedSql } from '@/lib/ai/tenant-query';
import { readTenantAiUsage } from '@/lib/ai/budget';
import { logger, requestContextFrom } from '@/lib/observability/logger';
import { dispatchDueJobs } from '@/lib/worker/dispatcher';
import { processNotification } from '@/lib/notifications/outbox';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const UUID_V7_REQUESTER = '0192b3a4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
const UUID_V7_REVIEWER = '0192b3a4-9f8e-7d6c-8b5a-4f3e2d1c0b9a';

function createRecordingRunner() {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const runner: SqlRunner = {
        query: (async (text: string, params: unknown[]) => {
            calls.push({ text, params });
            return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
        }) as SqlRunner['query'],
    };
    return { runner, calls };
}

function buildPersistedApprovalRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenant_id: TENANT_ID,
        policy_id: 'payments.refund',
        title: 'Refund pay_123',
        description: 'Duplicate payment refund',
        priority: 'HIGH',
        status: 'PENDING',
        resource_type: 'payment',
        resource_id: 'pay_123',
        payload: {},
        requested_by_user_id: UUID_V7_REQUESTER,
        requested_by_role: 'ACCOUNTANT',
        required_approver_roles: ['FINANCE_LEAD', 'SUPER_ADMIN'],
        min_approvals: 1,
        allow_requester_approval: false,
        escalation_level: 0,
        due_at: '2026-11-11T12:00:00.000Z',
        expires_at: '2026-11-13T08:00:00.000Z',
        completed_at: null,
        created_at: '2026-11-11T08:00:00.000Z',
        updated_at: '2026-11-11T08:00:00.000Z',
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithTenantContext.mockImplementation(async (_tenantId: string, fn: () => Promise<unknown>) => fn());
    mockRunWithRlsBypass.mockImplementation(async (_justification: unknown, fn: () => Promise<unknown>) => fn());
});

describe('[H-07] Workflow approvals expiry, single-use consumption & UUIDv7 actors', () => {
    it('accepts RFC 9562 UUIDv7 actor IDs and blocks UUIDv7 self-approval', () => {
        expect(UUID_RE.test(UUID_V7_REQUESTER)).toBe(true);
        expect(UUID_RE.test(UUID_V7_REVIEWER)).toBe(true);
        expect(UUID_RE.test('not-a-uuid')).toBe(false);

        const createdAt = new Date('2026-11-11T08:00:00.000Z');
        const request = createWorkflowApprovalRequest({
            id: 'approval-v7-1',
            policyId: 'payments.refund',
            tenantId: TENANT_ID,
            resource: { type: 'payment', id: 'pay_1', tenantId: TENANT_ID },
            requestedBy: { userId: UUID_V7_REQUESTER, role: 'FINANCE_LEAD', tenantId: TENANT_ID },
            now: createdAt,
        });

        expect(() =>
            reviewWorkflowApprovalRequest(request, {
                actor: { userId: UUID_V7_REQUESTER, role: 'FINANCE_LEAD', tenantId: TENANT_ID },
                decision: 'APPROVED',
                reason: 'Self approval attempt',
                now: new Date('2026-11-11T09:00:00.000Z'),
            }),
        ).toThrow('Requester cannot approve their own workflow approval request.');
    });

    it('rejects review of expired approval requests in the domain engine', () => {
        const createdAt = new Date('2026-11-01T00:00:00.000Z');
        const request = createWorkflowApprovalRequest({
            id: 'approval-exp-1',
            policyId: 'payments.refund',
            tenantId: TENANT_ID,
            resource: { type: 'payment', id: 'pay_exp', tenantId: TENANT_ID },
            requestedBy: { userId: UUID_V7_REQUESTER, role: 'ACCOUNTANT', tenantId: TENANT_ID },
            now: createdAt,
        });

        expect(() =>
            reviewWorkflowApprovalRequest(request, {
                actor: { userId: UUID_V7_REVIEWER, role: 'FINANCE_LEAD', tenantId: TENANT_ID },
                decision: 'APPROVED',
                reason: 'Late review after expiry',
                now: new Date('2026-11-05T00:00:00.000Z'),
            }),
        ).toThrow('Approval request has expired.');
    });

    it('rejects non-UUID actor IDs in repository instead of coercing to null/empty string', async () => {
        await expect(
            reviewPersistedWorkflowApprovalRequest({
                tenantId: TENANT_ID,
                approvalRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                actor: { userId: 'non-uuid-actor', role: 'FINANCE_LEAD', tenantId: TENANT_ID },
                decision: 'APPROVED',
                reason: 'Valid reason',
            }),
        ).rejects.toThrow(WorkflowApprovalError);
        expect(mockPoolConnect).not.toHaveBeenCalled();
    });

    it('rejects expired APPROVED requests in requireApprovedWorkflowApprovalOrRequest', async () => {
        const expiredApprovedRow = buildPersistedApprovalRow({
            status: 'APPROVED',
            expires_at: '2026-11-10T00:00:00.000Z',
            completed_at: '2026-11-09T01:00:00.000Z',
        });

        mockClientQuery.mockImplementation(async (sqlText: string) => {
            if (sqlText.includes('FROM workflow_approval_requests')) {
                return { rows: [expiredApprovedRow], rowCount: 1 };
            }
            return { rows: [], rowCount: 1 };
        });

        const gate = await requireApprovedWorkflowApprovalOrRequest({
            tenantId: TENANT_ID,
            policyId: 'payments.refund',
            approvalRequestId: expiredApprovedRow.id,
            reason: 'Duplicate payment refund',
            resource: { type: 'payment', id: 'pay_123', tenantId: TENANT_ID },
            payload: {},
            requestedBy: { userId: UUID_V7_REQUESTER, role: 'ACCOUNTANT', tenantId: TENANT_ID },
            now: new Date('2026-11-11T08:00:00.000Z'),
        });

        expect(gate.approved).toBe(false);
        expect(gate.request.status).toBe('EXPIRED');
    });

    it('consumes an APPROVED request atomically once and rejects replay with 409', async () => {
        let consumedPayload: Record<string, unknown> = {};

        mockClientQuery.mockImplementation(async (sqlText: string, params: unknown[] = []) => {
            if (sqlText.includes('FROM workflow_approval_requests')) {
                return {
                    rows: [
                        buildPersistedApprovalRow({
                            status: 'APPROVED',
                            expires_at: '2026-11-13T08:00:00.000Z',
                            payload: { ...consumedPayload },
                        }),
                    ],
                    rowCount: 1,
                };
            }
            if (sqlText.includes('UPDATE workflow_approval_requests') && sqlText.includes('RETURNING id')) {
                if ('consumed_at' in consumedPayload) {
                    return { rows: [], rowCount: 0 };
                }
                const mergedJson = typeof params[0] === 'string' ? (JSON.parse(params[0]) as Record<string, unknown>) : {};
                consumedPayload = { ...consumedPayload, ...mergedJson };
                return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 1 };
        });

        const gateInput = {
            tenantId: TENANT_ID,
            policyId: 'payments.refund',
            approvalRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            reason: 'Duplicate payment refund',
            resource: { type: 'payment', id: 'pay_123', tenantId: TENANT_ID },
            payload: {},
            requestedBy: { userId: UUID_V7_REQUESTER, role: 'ACCOUNTANT', tenantId: TENANT_ID },
            now: new Date('2026-11-11T09:00:00.000Z'),
        };

        const first = await requireApprovedWorkflowApprovalOrRequest(gateInput);
        expect(first.approved).toBe(true);
        expect(first.request.consumedAt).toBe('2026-11-11T09:00:00.000Z');

        await expect(requireApprovedWorkflowApprovalOrRequest(gateInput)).rejects.toMatchObject({
            name: 'WorkflowApprovalError',
            status: 409,
            message: 'Approval request has already been consumed.',
        });
    });
});

describe('[M-02] TenantScope hardening', () => {
    it('strips id, tenantId, tenant_id, and child foreignKey on update() and childUpdate()', async () => {
        const { runner, calls } = createRecordingRunner();
        const scope = new TenantScope(TENANT_ID, runner);

        await scope.update(
            invoices,
            {
                id: 'mutated-id',
                tenantId: '22222222-2222-4222-8222-222222222222',
                tenant_id: '22222222-2222-4222-8222-222222222222',
                paidAmount: '500',
            },
            eq(invoices.id, 'inv-1'),
        );

        expect(calls[0].text).toBe(
            'UPDATE "invoices" SET "paid_amount" = $1 WHERE ("invoices"."tenant_id" = $2 AND ("invoices"."id" = $3))',
        );
        expect(calls[0].params).toEqual(['500', TENANT_ID, 'inv-1']);

        const noOpCount = await scope.update(
            invoices,
            { id: 'mutated-id', tenantId: 'spoofed' },
            eq(invoices.id, 'inv-1'),
        );
        expect(noOpCount).toBe(0);
        expect(calls).toHaveLength(1);

        const claimRunner: SqlRunner = {
            query: (async () => ({
                rows: [{ id: 'plan-1' }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            })) as SqlRunner['query'],
        };
        const ownedPlan = await new TenantScope(TENANT_ID, claimRunner).claim(feePlans, 'plan-1');
        expect(ownedPlan).not.toBeNull();

        await scope.childUpdate(feeComponents, ownedPlan!, 'feePlanId', {
            id: 'hacked-child-id',
            feePlanId: 'other-plan',
            amount: '1500',
        });
        expect(calls[1].text).toBe(
            'UPDATE "fee_components" SET "amount" = $1 WHERE "fee_components"."fee_plan_id" = $2',
        );
        expect(calls[1].params).toEqual(['1500', 'plan-1']);
    });

    it('computes the union of keys across heterogeneous insert() rows and binds null for omitted keys', async () => {
        const { runner, calls } = createRecordingRunner();
        await new TenantScope(TENANT_ID, runner).insert(invoices, [
            { id: 'inv-1', studentId: 'stu-1' },
            { id: 'inv-2', studentId: 'stu-2', description: 'Lab fee' },
        ]);

        expect(calls[0].text).toBe(
            'INSERT INTO "invoices" ("id", "student_id", "tenant_id", "description") VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
        );
        expect(calls[0].params).toEqual([
            'inv-1',
            'stu-1',
            TENANT_ID,
            null,
            'inv-2',
            'stu-2',
            TENANT_ID,
            'Lab fee',
        ]);
    });

    it('wraps transaction() in runWithTenantContext and uses SAVEPOINT for nested transactions', async () => {
        const { runner, calls } = createRecordingRunner();
        const scope = new TenantScope(TENANT_ID, runner);

        await scope.transaction(async (tx) => {
            await tx.update(invoices, { status: 'PAID' }, eq(invoices.id, 'inv-1'));
            await tx.transaction(async (nested) => {
                await nested.update(invoices, { description: 'Settled' }, eq(invoices.id, 'inv-1'));
            });
        });

        expect(mockRunWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
        expect(calls.map((c) => c.text)).toEqual([
            'BEGIN',
            'UPDATE "invoices" SET "status" = $1 WHERE ("invoices"."tenant_id" = $2 AND ("invoices"."id" = $3))',
            'SAVEPOINT "sp_tenant_scope_1"',
            'UPDATE "invoices" SET "description" = $1 WHERE ("invoices"."tenant_id" = $2 AND ("invoices"."id" = $3))',
            'RELEASE SAVEPOINT "sp_tenant_scope_1"',
            'COMMIT',
        ]);
    });
});

describe('[M-07] proxy.ts matcher, HQ separation, null subscriptionTier & CSP style-src-attr', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
        delete process.env.CSP_ENFORCE;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('matches dynamic dot-containing routes while skipping static asset extensions', () => {
        const pattern = proxyConfig.matcher[0];
        const innerLookahead = pattern.slice(2, -1);
        const routeMatcher = new RegExp(`^/${innerLookahead}$`);

        expect(routeMatcher.test('/portal/tenant/obj.v1')).toBe(true);
        expect(routeMatcher.test('/portal/st.marys/dashboard')).toBe(true);
        expect(routeMatcher.test('/hq-overview')).toBe(true);

        expect(routeMatcher.test('/manifest.json')).toBe(false);
        expect(routeMatcher.test('/sw.js')).toBe(false);
        expect(routeMatcher.test('/hero-abstract.png')).toBe(false);
        expect(routeMatcher.test('/favicon.ico')).toBe(false);
        expect(routeMatcher.test('/api/copilot')).toBe(false);
    });

    it('keeps /hq founder-only while applying multi-campus tier guard to /hq-overview and /hq-policies', async () => {
        mockGetIronSession.mockResolvedValue({
            isLoggedIn: true,
            userId: UUID_V7_REQUESTER,
            tenantId: TENANT_ID,
            role: 'SUPER_ADMIN',
            mfaVerified: true,
            activeModules: ['ATTENDANCE', 'FEES'],
            subscriptionTier: 'CORE',
        });

        const hqFounderRes = await proxy(new NextRequest('https://school.example.edu/hq'));
        expect(hqFounderRes.headers.get('location')).toBe('https://school.example.edu/unauthorized');

        const hqOverviewRes = await proxy(new NextRequest('https://school.example.edu/hq-overview'));
        expect(hqOverviewRes.headers.get('location')).toBe('https://school.example.edu/upgrade?feature=hq');

        const hqPoliciesRes = await proxy(new NextRequest('https://school.example.edu/hq-policies'));
        expect(hqPoliciesRes.headers.get('location')).toBe('https://school.example.edu/upgrade?feature=hq');
    });

    it('fails closed to CORE on /chat when subscriptionTier is missing/undefined', async () => {
        mockGetIronSession.mockResolvedValue({
            isLoggedIn: true,
            userId: UUID_V7_REQUESTER,
            tenantId: TENANT_ID,
            role: 'SCHOOL_ADMIN',
            mfaVerified: true,
            activeModules: ['ATTENDANCE', 'FEES'],
            subscriptionTier: undefined,
        });

        const chatRes = await proxy(new NextRequest('https://school.example.edu/chat'));
        expect(chatRes.headers.get('location')).toBe('https://school.example.edu/upgrade?feature=ai');
    });

    it('keeps nonce-locked style-src for style elements while allowing style-src-attr unsafe-inline', () => {
        const nonce = createCspNonce();
        const csp = createContentSecurityPolicy(nonce, { isDevelopment: false });
        expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
        expect(csp).toContain("style-src-attr 'unsafe-inline'");
    });
});

describe('[M-08] & [L-05] AI SQL comment stripping, multi-relation scoping & budget DoS protection', () => {
    it('strips /* ... */ block comments (including nested) and rejects unscoped JOINs or comma joins', () => {
        const audit = auditTenantScopedSql(
            `/* leading comment /* nested */ */
             SELECT s.id
             FROM students s /* relation comment */
             JOIN grades g ON g.id = s.grade_id AND g.tenant_id = $1
             WHERE s.tenant_id = $1
             LIMIT 10`,
        );
        expect(audit.relations).toEqual(['students', 'grades']);
        expect(audit.tenantPredicates).toBe(2);

        expect(() =>
            auditTenantScopedSql('SELECT id FROM students /* unclosed comment WHERE tenant_id = $1 LIMIT 1'),
        ).toThrow(AiTenantScopeError);

        // Duplicate predicate on `s` must NOT satisfy `grades g`
        expect(() =>
            auditTenantScopedSql(
                'SELECT s.id FROM students s JOIN grades g ON g.id = s.grade_id WHERE s.tenant_id = $1 AND s.tenant_id = $1 LIMIT 5',
            ),
        ).toThrow(/Every relation must be tenant-scoped/);

        // Implicit comma join must be rejected
        expect(() =>
            auditTenantScopedSql(
                'SELECT s.id FROM students s, grades g WHERE s.tenant_id = $1 AND g.tenant_id = $1 LIMIT 5',
            ),
        ).toThrow(/Every relation must be tenant-scoped/);
    });

    it('excludes zero-token pre-LLM refusals when computing daily tenant AI budget usage', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ tokens: '420', requests: '3' }] });

        const usage = await readTenantAiUsage({
            tenantId: TENANT_ID,
            userId: UUID_V7_REQUESTER,
            role: 'SUPER_ADMIN',
            requestId: 'req-budget-1',
        });

        expect(usage.tokensUsedToday).toBe(420);
        expect(usage.requestsToday).toBe(3);
        const executedSql = String(mockPoolQuery.mock.calls[0]?.[0] ?? '');
        expect(executedSql).toContain('outcome:refused_no_tools');
        expect(executedSql).toContain('tokens_used > 0');
    });
});

describe('[M-12] & [H-05] Logger sanitization/redaction & Worker/Outbox lease guards', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('validates x-request-id against safe token pattern and redacts Aadhaar, APAAR, MFA, and backup codes', () => {
        const validReq = new Request('https://school.example.edu/api/test', {
            headers: { 'x-request-id': 'req_2026-11-11:trace.01' },
        });
        expect(requestContextFrom(validReq).requestId).toBe('req_2026-11-11:trace.01');

        const maliciousReq = new Request('https://school.example.edu/api/test', {
            headers: { 'x-request-id': 'forged id {"level":"CRITICAL"}; <script>' },
        });
        const generatedId = requestContextFrom(maliciousReq).requestId;
        expect(generatedId).not.toContain('forged');
        expect(UUID_RE.test(generatedId)).toBe(true);

        const oversizedReq = new Request('https://school.example.edu/api/test', {
            headers: { 'x-request-id': 'r'.repeat(129) },
        });
        expect(UUID_RE.test(requestContextFrom(oversizedReq).requestId)).toBe(true);

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        logger.warn('pii.audit_test', 'Testing redaction', {
            tenantId: TENANT_ID,
            metadata: {
                aadhaar: '1234-5678-9012',
                studentApaarId: 'APAAR-9999',
                mfaCode: '654321',
                mfa_code: '654321',
                backupCode: 'BC-SECRET',
                backup_code: 'BC-SECRET',
                safeField: 'kept',
            },
        });

        const logged = JSON.parse(String(spy.mock.calls[0]?.[0] ?? '{}')) as {
            metadata: Record<string, unknown>;
        };
        expect(logged.metadata).toEqual({
            aadhaar: '[Redacted]',
            studentApaarId: '[Redacted]',
            mfaCode: '[Redacted]',
            mfa_code: '[Redacted]',
            backupCode: '[Redacted]',
            backup_code: '[Redacted]',
            safeField: 'kept',
        });
    });

    it('sweeps stale RUNNING worker jobs and skips outbox notifications already leased in the future', async () => {
        const executedCalls: Array<{ sqlText: string; params: unknown[] }> = [];
        mockClientQuery.mockImplementation(async (sqlText: string, params: unknown[] = []) => {
            executedCalls.push({ sqlText, params });
            if (sqlText.includes('SELECT id,') && sqlText.includes('FROM notification_outbox')) {
                return {
                    rows: [
                        {
                            id: 'notif-1',
                            tenantId: TENANT_ID,
                            jobId: null,
                            channel: 'EMAIL',
                            status: 'QUEUED',
                            provider: 'resend',
                            recipient: 'parent@example.edu',
                            recipientUserId: null,
                            subject: 'Test',
                            body: '<p>Hello</p>',
                            payload: {},
                            attempts: 1,
                            maxAttempts: 3,
                        },
                    ],
                    rowCount: 1,
                };
            }
            // Simulate concurrent worker having already leased next_attempt_at into the future (0 rows returned)
            if (sqlText.includes("INTERVAL '5 minutes'") && sqlText.includes('RETURNING attempts')) {
                return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
        });

        const dispatchResult = await dispatchDueJobs({ queue: 'default', limit: 5, workerId: 'worker-test' });
        expect(dispatchResult.claimed).toBe(0);
        expect(
            executedCalls.some(
                (c) =>
                    c.sqlText.includes('attempts >= max_attempts') &&
                    c.params.includes('Job lease expired after worker crash or timeout'),
            ),
        ).toBe(true);
        expect(
            executedCalls.some(
                (c) =>
                    c.sqlText.includes('WITH next_jobs AS') &&
                    c.sqlText.includes("status = 'RUNNING'") &&
                    c.sqlText.includes("INTERVAL '15 minutes'"),
            ),
        ).toBe(true);

        const outboxResult = await processNotification('notif-1', TENANT_ID);
        expect(outboxResult).toEqual({
            success: true,
            provider: 'resend',
            status: 'QUEUED',
            metadata: { skipped: true, leased: true },
        });
    });
});
