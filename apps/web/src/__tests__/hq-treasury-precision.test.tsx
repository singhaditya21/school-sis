import TreasuryPage from '@/app/hq/treasury/page';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireRole: jest.fn(),
}));

describe('HQ treasury precision and access', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('keeps HQ access platform-only and passes exact currency-grouped decimals to the client', async () => {
        const methodRows = [{
            payment_method: 'CARD',
            currency: 'INR',
            total_volume: '9007199254740993.25',
            txn_count: 2,
        }];
        const nodeRows = [{
            node_name: 'North Campus',
            currency: 'INR',
            total_volume: '9007199254740993.25',
            txn_count: 2,
        }];
        const completedRows = [{ currency: 'INR', total_volume: '9007199254740993.25' }];
        const pendingRows = [{ currency: 'EUR', total_volume: '10.01' }];
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: methodRows })
            .mockResolvedValueOnce({ rows: nodeRows })
            .mockResolvedValueOnce({ rows: completedRows })
            .mockResolvedValueOnce({ rows: pendingRows });

        const result = await TreasuryPage();

        expect(requireRole).toHaveBeenCalledTimes(1);
        expect(requireRole).toHaveBeenCalledWith(UserRole.PLATFORM_ADMIN);
        expect(result.props).toEqual(expect.objectContaining({
            methodData: methodRows,
            nodeData: nodeRows,
            kpis: {
                completed: completedRows,
                pending: pendingRows,
            },
        }));

        const sql = (pool.query as jest.Mock).mock.calls
            .map(([statement]) => String(statement).replace(/\s+/g, ' '))
            .join('\n');
        expect(sql).toContain('SUM(p.amount), 0)::text AS total_volume');
        expect(sql).toContain("'UNSPECIFIED') AS currency");
        expect(sql).not.toMatch(/SUM\([^)]*amount[^)]*\)::int/i);
        expect(sql).toContain('GROUP BY p.method, 2');
        expect(sql).toContain('GROUP BY t.id, t.name, 2');
        expect(sql.match(/GROUP BY 1/g)).toHaveLength(2);
    });
});
