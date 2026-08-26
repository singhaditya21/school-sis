/**
 * The safety properties of the AI spine, asserted directly.
 *
 * These are the claims the product makes about its AI. If one of them stops being
 * true, this file fails before anything reaches a school.
 */
import { z } from 'zod';

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
    runWithTenantContext: jest.fn(async (_tenantId: string, fn: () => Promise<unknown>) => fn()),
    runWithRlsBypass: jest.fn(async (_j: unknown, fn: () => Promise<unknown>) => fn()),
    RLS_BYPASS_JUSTIFICATIONS: { PLATFORM_EVENT_WRITE: 'PLATFORM_EVENT_WRITE' },
}));

jest.mock('@school-sis/api', () => {
    const actual = jest.requireActual('@school-sis/api');
    return { ...actual, createPersistedWorkflowApprovalRequest: jest.fn() };
});

import { pool, runWithTenantContext } from '@/lib/db';
import { createPersistedWorkflowApprovalRequest } from '@school-sis/api';
import { auditTenantScopedSql, runTenantScopedRead, AiTenantScopeError } from '../tenant-query';
import { createAiToolRegistry, AiRegistryError, describeToolsForModel } from '../registry';
import { aiToolRegistry, AI_MUTATION_TOOLS, AI_READ_TOOLS } from '../tools';
import { executeAiTool } from '../executor';
import { redactQuestion } from '../telemetry';
import { resolveAiProvider } from '../provider';
import { toModelToolName, fromModelToolName } from '../model-names';
import type { AiTool, AiToolContext } from '../types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

function context(overrides: Partial<AiToolContext> = {}): AiToolContext {
    return {
        tenantId: TENANT_A,
        userId: '33333333-3333-4333-8333-333333333333',
        role: 'SUPER_ADMIN' as AiToolContext['role'],
        requestId: 'test-request',
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    (runWithTenantContext as jest.Mock).mockImplementation(async (_tenantId: string, fn: () => Promise<unknown>) => fn());
});

describe('tenant scope guard', () => {
    it('rejects a statement with no tenant predicate', () => {
        expect(() => auditTenantScopedSql('SELECT id FROM students LIMIT 5')).toThrow(AiTenantScopeError);
    });

    it('rejects a join whose second relation is not tenant-scoped', () => {
        expect(() =>
            auditTenantScopedSql(
                'SELECT s.id FROM students s JOIN grades g ON g.id = s.grade_id WHERE s.tenant_id = $1 LIMIT 5',
            ),
        ).toThrow(/Every relation must be tenant-scoped/);
    });

    it('accepts a join where every relation carries its own predicate', () => {
        const audit = auditTenantScopedSql(
            'SELECT s.id FROM students s JOIN grades g ON g.id = s.grade_id AND g.tenant_id = $1 WHERE s.tenant_id = $1 LIMIT 5',
        );
        expect(audit.relations).toEqual(['students', 'grades']);
        expect(audit.tenantPredicates).toBe(2);
    });

    it('rejects unbounded reads and anything that writes', () => {
        expect(() => auditTenantScopedSql('SELECT id FROM students WHERE tenant_id = $1')).toThrow(/LIMIT/);
        expect(() => auditTenantScopedSql('UPDATE students SET status = $2 WHERE tenant_id = $1')).toThrow();
        expect(() =>
            auditTenantScopedSql('SELECT id FROM students WHERE tenant_id = $1 LIMIT 1; DELETE FROM students'),
        ).toThrow();
    });

    it('refuses to bind $1 to a tenant other than the caller', async () => {
        await expect(
            runTenantScopedRead(context(), 'SELECT id FROM students WHERE tenant_id = $1 LIMIT 1', [TENANT_B]),
        ).rejects.toThrow(/bind \$1 to the caller tenant id/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('runs inside the caller tenant RLS context', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'x' }] });
        await runTenantScopedRead(context(), 'SELECT id FROM students WHERE tenant_id = $1 LIMIT 1');
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id = $1'), [TENANT_A]);
    });
});

describe('every registered tool', () => {
    it('declares a permission and a model-safe description', () => {
        for (const tool of aiToolRegistry.all()) {
            expect(tool.permission).toMatch(/^[a-z_]+:[a-z_*]+$/);
            expect(tool.description.length).toBeGreaterThan(20);
        }
    });

    it('routes every mutation to a policy the approvals engine owns', () => {
        for (const tool of AI_MUTATION_TOOLS) {
            expect(typeof tool.approvalPolicyId).toBe('string');
            expect(tool.approvalPolicyId.length).toBeGreaterThan(0);
        }
        // Construction re-validates the policy ids against the real policy table.
        expect(() => createAiToolRegistry([...AI_READ_TOOLS, ...AI_MUTATION_TOOLS] as unknown as AiTool<never>[])).not.toThrow();
    });

    it('reads only through the tenant guard — no tool touches the pool directly', () => {
        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const dir = path.join(__dirname, '..', 'tools');
        for (const file of fs.readdirSync(dir)) {
            const source = fs.readFileSync(path.join(dir, file), 'utf8');
            expect(source).not.toMatch(/from '@\/lib\/db'/);
        }
    });
});

describe('registry validation', () => {
    const stub = {
        kind: 'read' as const,
        title: 'Stub',
        description: 'A description long enough to be a contract with the model.',
        permission: 'students:read',
        inputSchema: z.object({}),
        run: async () => ({ summary: '', fields: [], rows: [] }),
    };

    it('rejects duplicate names', () => {
        expect(() =>
            createAiToolRegistry([
                { ...stub, name: 'a.b' },
                { ...stub, name: 'a.b' },
            ] as unknown as AiTool<never>[]),
        ).toThrow(AiRegistryError);
    });

    it('rejects a mutation naming an unknown approval policy', () => {
        expect(() =>
            createAiToolRegistry([
                {
                    ...stub,
                    kind: 'mutation',
                    name: 'a.c',
                    approvalPolicyId: 'not.a.real.policy',
                    propose: async () => ({ refused: 'no' }),
                },
            ] as unknown as AiTool<never>[]),
        ).toThrow(/does not know/);
    });

    it('hides tools a role has no permission for', () => {
        const parentTools = aiToolRegistry.forRole('PARENT').map((tool) => tool.name);
        expect(parentTools).toEqual([]);

        const teacherTools = aiToolRegistry.forRole('TEACHER').map((tool) => tool.name);
        expect(teacherTools).not.toContain('fees.request_invoice_waiver');
        expect(teacherTools).not.toContain('fees.outstanding_summary');

        const accountantTools = aiToolRegistry.forRole('ACCOUNTANT').map((tool) => tool.name);
        expect(accountantTools).toContain('fees.outstanding_summary');
    });

    it('describes tools to the model without leaking data', () => {
        const described = describeToolsForModel(aiToolRegistry.all());
        expect(described).toContain('does NOT execute');
        expect(described).toContain('requires fees:approve');
    });
});

describe('executor', () => {
    it('re-checks the permission even when the tool was somehow named directly', async () => {
        const execution = await executeAiTool(
            aiToolRegistry,
            'fees.request_invoice_waiver',
            { invoiceNumber: 'INV-1', reason: 'a reason long enough to pass' },
            context({ role: 'TEACHER' as AiToolContext['role'] }),
        );
        expect(execution.run.status).toBe('refused');
        expect(execution.modelResult.ok).toBe(false);
        expect(execution.modelResult.summary).toContain('fees:approve');
        expect(createPersistedWorkflowApprovalRequest).not.toHaveBeenCalled();
    });

    it('refuses an unknown tool name', async () => {
        const execution = await executeAiTool(aiToolRegistry, 'students.delete_everything', {}, context());
        expect(execution.run.status).toBe('refused');
        expect(createPersistedWorkflowApprovalRequest).not.toHaveBeenCalled();
    });

    it('reports failing argument paths, never failing argument values', async () => {
        const execution = await executeAiTool(
            aiToolRegistry,
            'fees.invoice_lookup',
            { invoiceNumber: '' },
            context(),
        );
        expect(execution.run.status).toBe('refused');
        expect(execution.modelResult.summary).toContain('invoiceNumber');
        expect(execution.modelResult.summary).not.toContain("''");
    });

    it('turns a mutation into a PENDING approval and executes nothing', async () => {
        (pool.query as jest.Mock).mockResolvedValue({
            rows: [
                {
                    id: 'invoice-1',
                    invoice_number: 'INV-1',
                    status: 'PENDING',
                    total_amount: '5000.00',
                    paid_amount: '1000.00',
                },
            ],
        });
        (createPersistedWorkflowApprovalRequest as jest.Mock).mockResolvedValue({
            id: 'approval-1',
            policyId: 'fees.invoice.waive',
            status: 'PENDING',
            minApprovals: 1,
            requiredApproverRoles: ['FINANCE_LEAD', 'SCHOOL_ADMIN', 'SUPER_ADMIN'],
        });

        const execution = await executeAiTool(
            aiToolRegistry,
            'fees.request_invoice_waiver',
            { invoiceNumber: 'INV-1', reason: 'Documented family hardship for this term.' },
            context(),
        );

        expect(execution.run.status).toBe('approval_requested');
        expect(execution.modelResult.summary).toContain('Nothing was changed');
        const call = (createPersistedWorkflowApprovalRequest as jest.Mock).mock.calls[0][0];
        expect(call.policyId).toBe('fees.invoice.waive');
        expect(call.tenantId).toBe(TENANT_A);
        expect(call.resource).toEqual({ type: 'invoice', id: 'invoice-1', label: 'INV-1', tenantId: TENANT_A });
        expect(call.reason).toContain('hardship');
        // Only SELECTs ever reached the database.
        for (const [sql] of (pool.query as jest.Mock).mock.calls) {
            expect(String(sql).trim().toUpperCase().startsWith('SELECT')).toBe(true);
        }
    });

    it('refuses rather than guessing when the row is not in this tenant', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
        const execution = await executeAiTool(
            aiToolRegistry,
            'fees.request_invoice_waiver',
            { invoiceNumber: 'SOMEONE-ELSES-INV', reason: 'Trying a number from another school.' },
            context(),
        );
        expect(execution.run.status).toBe('refused');
        expect(execution.modelResult.summary).toContain('exists in this school, so no waiver was requested');
        expect(createPersistedWorkflowApprovalRequest).not.toHaveBeenCalled();
    });
});

describe('telemetry redaction', () => {
    it('masks identity numbers and emails out of the stored question', () => {
        const redacted = redactQuestion('Waive for aadhaar 123456789012, call 98765 43210, mail a.b@c.com');
        expect(redacted).not.toContain('123456789012');
        expect(redacted).not.toContain('98765 43210');
        expect(redacted).not.toContain('a.b@c.com');
        expect(redacted).toContain('[number]');
        expect(redacted).toContain('[email]');
    });
});

describe('honest degradation', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('says plainly that no provider is configured', () => {
        delete process.env.CEREBRAS_API_KEY;
        delete process.env.OPENAI_API_KEY;
        const provider = resolveAiProvider();
        expect(provider.configured).toBe(false);
        expect(provider.reason).toContain('No model provider is configured');
    });

    it('uses a configured provider without exposing the key', () => {
        process.env.CEREBRAS_API_KEY = 'test-key';
        const provider = resolveAiProvider();
        expect(provider.configured).toBe(true);
        expect(provider.config?.source).toBe('CEREBRAS_API_KEY');
    });
});

describe('model-facing tool names', () => {
    it('round-trips dotted names through an OpenAI-legal form', () => {
        for (const tool of aiToolRegistry.all()) {
            const modelName = toModelToolName(tool.name);
            expect(modelName).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
            expect(fromModelToolName(modelName)).toBe(tool.name);
        }
    });
});
