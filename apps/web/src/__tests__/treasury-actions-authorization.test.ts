import {
    getPaymentsLedgerAction,
    getTreasuryExceptionsAction,
    getTreasurySummaryAction,
} from '@/lib/actions/treasury';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { UserRole } from '@/lib/rbac/permissions';

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
}));

jest.mock('@/lib/auth/session', () => ({
    getSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
    redirect: jest.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

const TENANT_ID = '1523fd08-51bf-4200-a1dc-5aba7a8bf3a2';
const USER_ID = '63341ba8-12bd-451d-bd11-a0ccb45aab15';

function mockSession(role: UserRole, activeModules: string[] = ['FEES']) {
    (getSession as jest.Mock).mockResolvedValue({
        isLoggedIn: true,
        userId: USER_ID,
        tenantId: TENANT_ID,
        role,
        email: 'operator@school.example',
        activeModules,
        institutionType: 'K12',
        mfaRequired: false,
        mfaVerified: false,
    });
}

const tenantWideReads = [
    ['summary', () => getTreasurySummaryAction()],
    ['ledger', () => getPaymentsLedgerAction()],
    ['exceptions', () => getTreasuryExceptionsAction()],
] as const;

describe('treasury action authorization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it.each([
        UserRole.PARENT,
        UserRole.STUDENT,
        UserRole.TEACHER,
    ])('denies every tenant-wide read to %s', async (role) => {
        mockSession(role);

        for (const [, read] of tenantWideReads) {
            await expect(read()).rejects.toThrow('Forbidden: insufficient permissions');
        }

        expect(pool.query).not.toHaveBeenCalled();
    });

    it('allows a finance lead to read tenant-scoped treasury aggregates', async () => {
        mockSession(UserRole.FINANCE_LEAD);
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [{ totalCollected: '9007199254740993.25' }] })
            .mockResolvedValueOnce({ rows: [{ totalOverdue: '100.50' }] })
            .mockResolvedValueOnce({ rows: [{ totalOutstanding: '200.75' }] });

        await expect(getTreasurySummaryAction()).resolves.toEqual({
            totalCollected: '9007199254740993.25',
            totalOverdue: '100.50',
            totalOutstanding: '200.75',
        });

        expect(pool.query).toHaveBeenCalledTimes(3);
        expect((pool.query as jest.Mock).mock.calls[0][1]).toEqual([TENANT_ID]);
        expect((pool.query as jest.Mock).mock.calls[1][1]).toEqual(['OVERDUE', TENANT_ID]);
        expect((pool.query as jest.Mock).mock.calls[2][1]).toEqual(['PENDING', TENANT_ID]);
    });

    it('allows a tenant super admin to read the tenant ledger and exceptions', async () => {
        mockSession(UserRole.SUPER_ADMIN);
        const ledger = [{ id: 'payment-1', amount: '42.25' }];
        const exceptions = [{ id: 'payment-2', amount: '11.10' }];
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: ledger })
            .mockResolvedValueOnce({ rows: exceptions });

        await expect(getPaymentsLedgerAction(1_000)).resolves.toEqual(ledger);
        await expect(getTreasuryExceptionsAction()).resolves.toEqual(exceptions);

        expect((pool.query as jest.Mock).mock.calls[0][1]).toEqual([TENANT_ID, 100]);
        expect((pool.query as jest.Mock).mock.calls[1][1]).toEqual([TENANT_ID]);
    });

    it('fails closed before querying when the payments entitlement is absent', async () => {
        mockSession(UserRole.FINANCE_LEAD, []);

        await expect(getTreasurySummaryAction()).rejects.toMatchObject({
            name: 'CapabilityAccessError',
            decision: expect.objectContaining({ reason: 'NOT_ENTITLED' }),
        });
        expect(pool.query).not.toHaveBeenCalled();
    });
});
