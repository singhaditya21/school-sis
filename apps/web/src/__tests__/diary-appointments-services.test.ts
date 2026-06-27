import { getDiaryEntries } from '@/lib/services/diary/diary.service';
import { getAppointments } from '@/lib/services/appointments/appointments.service';
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

describe('Diary and Appointments Services', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getDiaryEntries', () => {
        it('calls requireAuth with diary:read, executes parameterized query with tenantId, and returns rows', async () => {
            const mockTenantId = 'tenant-xyz';
            const mockRows = [{ id: '1', title: 'Homework' }];

            (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
            (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

            const result = await getDiaryEntries();

            expect(requireAuth).toHaveBeenCalledWith('diary:read');
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('FROM diary_entries'),
                [mockTenantId]
            );
            expect(result).toEqual(mockRows);
        });

        it('throws an error if requireAuth fails', async () => {
            (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

            await expect(getDiaryEntries()).rejects.toThrow('Unauthorized');
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    describe('getAppointments', () => {
        it('calls requireAuth with appointments:read, executes parameterized query with tenantId, and returns rows', async () => {
            const mockTenantId = 'tenant-123';
            const mockRows = [{ id: '2', title: 'Meeting' }];

            (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
            (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

            const result = await getAppointments();

            expect(requireAuth).toHaveBeenCalledWith('appointments:read');
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('FROM appointments'),
                [mockTenantId]
            );
            expect(result).toEqual(mockRows);
        });

        it('throws an error if requireAuth fails', async () => {
            (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

            await expect(getAppointments()).rejects.toThrow('Unauthorized');
            expect(pool.query).not.toHaveBeenCalled();
        });
    });
});
