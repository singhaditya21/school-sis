import {
    getActiveBatchesAction,
    getCoachingDashboardSummaryAction,
    getTestSeriesAction,
} from '@/lib/actions/coaching';
import { pool } from '@/lib/db';
import { requireCapability } from '@/lib/capabilities/server';

jest.mock('@/lib/db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

jest.mock('@/lib/capabilities/server', () => ({
    requireCapability: jest.fn(),
}));

const TENANT_ID = 'c33c02a8-6206-421b-a38f-7c4fbca89409';

describe('coaching read actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireCapability as jest.Mock).mockResolvedValue({ tenantId: TENANT_ID });
    });

    it('gates and tenant-scopes active batch reads using real schema columns', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

        await expect(getActiveBatchesAction()).resolves.toEqual([]);

        expect(requireCapability).toHaveBeenCalledWith('coaching', 'quiz:read');
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('target_exam AS "targetExam"'),
            [TENANT_ID],
        );
        expect((pool.query as jest.Mock).mock.calls[0][0]).not.toContain('course_id');
        expect((pool.query as jest.Mock).mock.calls[0][0]).not.toContain('capacity');
    });

    it('returns only database-backed coaching summary counts', async () => {
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [{ count: '2' }] })
            .mockResolvedValueOnce({ rows: [{ count: '3' }] });

        await expect(getCoachingDashboardSummaryAction()).resolves.toEqual({
            activeBatches: 2,
            upcomingTests: 3,
        });

        expect(requireCapability).toHaveBeenCalledWith('coaching', 'quiz:read');
        expect(pool.query).toHaveBeenNthCalledWith(1, expect.any(String), [TENANT_ID]);
        expect(pool.query).toHaveBeenNthCalledWith(2, expect.any(String), [TENANT_ID]);
    });

    it('does not query test-series data when the hidden capability is denied', async () => {
        (requireCapability as jest.Mock).mockRejectedValue(new Error('Capability coaching is unavailable (HIDDEN).'));

        await expect(getTestSeriesAction()).rejects.toThrow('HIDDEN');
        expect(pool.query).not.toHaveBeenCalled();
    });
});
