import { getHostelFees } from '@/lib/services/hostel/hostel.service';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

jest.mock('@/lib/db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
}));

describe('Hostel Service - getHostelFees', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should require hostel:read permission, query database with tenantId, and map amount to a number', async () => {
        const mockTenantId = 'tenant-hostel-xyz';
        const mockRows = [
            { id: 'fee-1', amount: '1200.50', studentName: 'John Doe', feeType: 'hostel' },
            { id: 'fee-2', amount: '500.00', studentName: 'Jane Smith', feeType: 'mess' },
        ];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

        const result = await getHostelFees();

        expect(requireAuth).toHaveBeenCalledWith('hostel:read');
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM hostel_fees'),
            [mockTenantId]
        );
        expect(result).toEqual([
            { id: 'fee-1', amount: 1200.5, studentName: 'John Doe', feeType: 'hostel' },
            { id: 'fee-2', amount: 500, studentName: 'Jane Smith', feeType: 'mess' },
        ]);
    });

    it('should query with status filter when provided', async () => {
        const mockTenantId = 'tenant-hostel-xyz';
        const mockRows = [{ id: 'fee-1', amount: '1200.50', status: 'pending' }];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

        const result = await getHostelFees('pending');

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('AND hf.status = $2'),
            [mockTenantId, 'pending']
        );
        expect(result).toEqual([{ id: 'fee-1', amount: 1200.5, status: 'pending' }]);
    });

    it('should query with both status and feeType filters when provided', async () => {
        const mockTenantId = 'tenant-hostel-xyz';
        const mockRows = [{ id: 'fee-1', amount: '1200.50', status: 'pending', feeType: 'mess' }];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

        const result = await getHostelFees('pending', 'mess');

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('AND hf.status = $2'),
            expect.anything()
        );
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('AND hf.fee_type = $3'),
            [mockTenantId, 'pending', 'mess']
        );
        expect(result).toEqual([{ id: 'fee-1', amount: 1200.5, status: 'pending', feeType: 'mess' }]);
    });

    it('should throw an error if requireAuth fails', async () => {
        (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

        await expect(getHostelFees()).rejects.toThrow('Unauthorized');
        expect(pool.query).not.toHaveBeenCalled();
    });
});
