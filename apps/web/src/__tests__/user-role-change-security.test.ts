import fs from 'node:fs';
import path from 'node:path';
import { requireApprovedWorkflowApprovalOrRequest } from '@school-sis/api';
import { pool, runWithTenantContext } from '@/lib/db';
import { changeUserRoleWithApproval } from '@/lib/workflows/adoption-execution';

jest.mock('@school-sis/api', () => ({
    ...jest.requireActual('@school-sis/api'),
    requireApprovedWorkflowApprovalOrRequest: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    pool: {
        query: jest.fn(),
        connect: jest.fn(),
    },
    runWithTenantContext: jest.fn((_tenantId: string, operation: () => unknown) => operation()),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const OTHER_TENANT_ID = '8fb9c1c0-5a74-47d4-b88d-f8f00c59064e';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

function userRow(overrides: Record<string, unknown> = {}) {
    return {
        id: TARGET_ID,
        tenantId: TENANT_ID,
        email: 'teacher@example.edu',
        firstName: 'Tara',
        lastName: 'Teacher',
        role: 'TEACHER',
        isActive: true,
        ...overrides,
    };
}

function approvalRow(overrides: Record<string, unknown> = {}) {
    return {
        tenantId: TENANT_ID,
        policyId: 'users.role_change',
        status: 'APPROVED',
        resourceType: 'identity.user',
        resourceId: TARGET_ID,
        payload: {},
        ...overrides,
    };
}

function roleChangeInput(overrides: Record<string, unknown> = {}) {
    return {
        tenantId: TENANT_ID,
        userId: TARGET_ID,
        targetRole: 'PRINCIPAL',
        reason: 'Academic leadership assignment',
        actor: {
            userId: ACTOR_ID,
            role: 'SCHOOL_ADMIN' as const,
            tenantId: TENANT_ID,
        },
        ...overrides,
    };
}

describe('approval-backed user role change security', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects assigning a peer or higher role before creating an approval', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [userRow()] });

        await expect(changeUserRoleWithApproval(roleChangeInput({ targetRole: 'SUPER_ADMIN' })))
            .rejects.toThrow('at or above your own privilege boundary');
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects modifying a peer account and changing the requester own role', async () => {
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [userRow({ role: 'SCHOOL_ADMIN' })] })
            .mockResolvedValueOnce({ rows: [userRow({ id: ACTOR_ID })] });

        await expect(changeUserRoleWithApproval(roleChangeInput({ targetRole: 'TEACHER' })))
            .rejects.toThrow('peer or higher-privilege user');
        await expect(changeUserRoleWithApproval(roleChangeInput({ userId: ACTOR_ID })))
            .rejects.toThrow('own role');
    });

    it('rejects an actor/user tenant mismatch even if a malformed data source returned a row', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [userRow({ tenantId: OTHER_TENANT_ID })] });

        await expect(changeUserRoleWithApproval(roleChangeInput()))
            .rejects.toThrow('active tenant');
    });

    it('rechecks target privilege under lock after approval and before the role update', async () => {
        const client = {
            query: jest.fn(async (sql: string) => {
                if (sql.includes('FROM workflow_approval_requests')) return { rows: [approvalRow()] };
                if (sql.includes('FROM users')) return { rows: [userRow({ role: 'SCHOOL_ADMIN' })] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow()] });
        (pool.connect as jest.Mock).mockResolvedValue(client);
        (requireApprovedWorkflowApprovalOrRequest as jest.Mock).mockResolvedValue({
            approved: true,
            request: { id: '33333333-3333-4333-8333-333333333333' },
        });

        await expect(changeUserRoleWithApproval(roleChangeInput()))
            .rejects.toThrow('peer or higher-privilege user');

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE users'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    it('increments authVersion and writes the approval audit in the same role-change transaction', async () => {
        const client = {
            query: jest.fn(async (sql: string) => {
                if (sql.includes('FROM workflow_approval_requests')) {
                    return { rows: [approvalRow()] };
                }
                if (sql.includes('SELECT') && sql.includes('FROM users')) {
                    return { rows: [userRow()] };
                }
                if (sql.includes('UPDATE workflow_approval_requests')) {
                    return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow()] });
        (pool.connect as jest.Mock).mockResolvedValue(client);
        (requireApprovedWorkflowApprovalOrRequest as jest.Mock).mockResolvedValue({
            approved: true,
            request: {
                id: '33333333-3333-4333-8333-333333333333',
                tenantId: TENANT_ID,
                policyId: 'users.role_change',
                resource: { type: 'identity.user', id: TARGET_ID, tenantId: TENANT_ID },
                payload: {},
            },
        });

        await expect(changeUserRoleWithApproval(roleChangeInput())).resolves.toMatchObject({
            status: 'EXECUTED',
            action: 'USER_ROLE_CHANGED',
        });

        const updateCall = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
        expect(updateCall?.[0]).toContain('auth_version = auth_version + 1');
        const approvalUpdateCall = client.query.mock.calls.find(([sql]) =>
            String(sql).includes('UPDATE workflow_approval_requests'),
        );
        expect(approvalUpdateCall?.[0]).toContain("AND status = 'APPROVED'");
        expect(approvalUpdateCall?.[0]).toContain("SET status = 'EXECUTED'");
        const approvalEventCall = client.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO workflow_approval_events'),
        );
        expect(approvalEventCall?.[0]).toContain("'EXECUTED', 'APPROVED', 'EXECUTED'");
        const auditCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_logs'));
        expect(auditCall).toBeDefined();
        expect(JSON.stringify(auditCall)).toContain('sessionsRevoked');
        expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
        const approvalLockIndex = client.query.mock.calls.findIndex(([sql]) =>
            String(sql).includes('FROM workflow_approval_requests'),
        );
        const userLockIndex = client.query.mock.calls.findIndex(([sql]) => String(sql).includes('FROM users'));
        expect(client.query.mock.calls[approvalLockIndex]?.[0]).toContain('FOR UPDATE');
        expect(approvalLockIndex).toBeLessThan(userLockIndex);
        expect(client.query.mock.calls.findIndex(([sql]) => String(sql).includes('UPDATE workflow_approval_requests')))
            .toBeLessThan(client.query.mock.calls.findIndex(([sql]) => String(sql).includes('UPDATE users')));
    });

    it('rejects a consumed approval replay before mutating a role, even after the user returns to the original role', async () => {
        const client = {
            query: jest.fn(async (sql: string) => {
                if (sql.includes('FROM workflow_approval_requests')) {
                    return { rows: [approvalRow({ status: 'EXECUTED' })] };
                }
                if (sql.includes('SELECT') && sql.includes('FROM users')) return { rows: [userRow()] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [userRow()] });
        (pool.connect as jest.Mock).mockResolvedValue(client);
        (requireApprovedWorkflowApprovalOrRequest as jest.Mock).mockResolvedValue({
            approved: true,
            request: {
                id: '33333333-3333-4333-8333-333333333333',
                tenantId: TENANT_ID,
                policyId: 'users.role_change',
                resource: { type: 'identity.user', id: TARGET_ID, tenantId: TENANT_ID },
                payload: {},
            },
        });

        await expect(changeUserRoleWithApproval(roleChangeInput()))
            .rejects.toThrow('already been executed or is no longer approved');

        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE users'))).toBe(false);
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(false);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('allows only one concurrent caller to consume an approved role change', async () => {
        let approvalConsumed = false;
        const clients = Array.from({ length: 2 }, () => ({
            query: jest.fn(async (sql: string) => {
                if (sql.includes('FROM workflow_approval_requests')) {
                    return { rows: [approvalRow()] };
                }
                if (sql.includes('SELECT') && sql.includes('FROM users')) return { rows: [userRow()] };
                if (sql.includes('UPDATE workflow_approval_requests')) {
                    if (approvalConsumed) return { rows: [] };
                    approvalConsumed = true;
                    return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn(),
        }));
        (pool.query as jest.Mock).mockResolvedValue({ rows: [userRow()] });
        (pool.connect as jest.Mock)
            .mockResolvedValueOnce(clients[0])
            .mockResolvedValueOnce(clients[1]);
        (requireApprovedWorkflowApprovalOrRequest as jest.Mock).mockResolvedValue({
            approved: true,
            request: {
                id: '33333333-3333-4333-8333-333333333333',
                tenantId: TENANT_ID,
                policyId: 'users.role_change',
                resource: { type: 'identity.user', id: TARGET_ID, tenantId: TENANT_ID },
                payload: {},
            },
        });

        const results = await Promise.allSettled([
            changeUserRoleWithApproval(roleChangeInput()),
            changeUserRoleWithApproval(roleChangeInput()),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        const roleMutations = clients.flatMap((client) => client.query.mock.calls)
            .filter(([sql]) => String(sql).includes('UPDATE users'));
        expect(roleMutations).toHaveLength(1);
    });

    it('wires Edit role changes to the approval API and never to the profile action', () => {
        const pageSource = fs.readFileSync(
            path.join(process.cwd(), 'src/app/(admin)/settings/users/page.tsx'),
            'utf8',
        );
        const actionSource = fs.readFileSync(
            path.join(process.cwd(), 'src/lib/actions/users.ts'),
            'utf8',
        );

        expect(pageSource).toContain('/api/identity/users/${encodeURIComponent(user.id)}/role-change');
        expect(pageSource).toContain('approvalRequestId: roleApproval.id');
        expect(pageSource).toContain("status: 'APPROVAL_REQUIRED'");
        expect(actionSource).toContain('Role changes must use the approval-backed API.');

        const profileUpdate = actionSource.slice(
            actionSource.indexOf('export async function updateUserProfile'),
            actionSource.indexOf('/** Activate/deactivate'),
        );
        const profileSetClause = profileUpdate.slice(
            profileUpdate.indexOf('SET email'),
            profileUpdate.indexOf('WHERE id = $4'),
        );
        expect(profileSetClause).not.toMatch(/\brole\s*=/);
    });
});
