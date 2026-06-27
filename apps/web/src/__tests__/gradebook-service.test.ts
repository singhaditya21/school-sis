import { getGradebookData } from '@/lib/services/gradebook/gradebook.service';
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

describe('Gradebook Service - getGradebookData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should require gradebook:read permission and query database for classes and exams with tenantId', async () => {
        const mockTenantId = 'tenant-gradebook-123';
        const mockClasses = [
            { id: 'grade-1', name: 'Grade 1' },
            { id: 'grade-2', name: 'Grade 2' },
        ];
        const mockExams = [
            { id: 'exam-1', name: 'Mid Term 2026', type: 'MID_TERM' },
        ];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: mockClasses })
            .mockResolvedValueOnce({ rows: mockExams });

        const result = await getGradebookData();

        expect(requireAuth).toHaveBeenCalledWith('gradebook:read');
        expect(pool.query).toHaveBeenNthCalledWith(1,
            expect.stringContaining('FROM grades'),
            [mockTenantId]
        );
        expect(pool.query).toHaveBeenNthCalledWith(2,
            expect.stringContaining('FROM exams'),
            [mockTenantId]
        );
        expect(result).toEqual({
            classes: mockClasses,
            exams: mockExams,
            students: [],
        });
    });

    it('should query students if classId is provided, filtering by tenantId and classId', async () => {
        const mockTenantId = 'tenant-gradebook-123';
        const mockClassId = 'class-456';
        const mockClasses = [{ id: 'grade-1', name: 'Grade 1' }];
        const mockExams = [{ id: 'exam-1', name: 'Mid Term', type: 'MID_TERM' }];
        const mockStudents = [
            { id: 'stud-1', name: 'Alice Smith', rollNo: 1, class: 'Grade 1', section: 'A' },
        ];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: mockClasses })
            .mockResolvedValueOnce({ rows: mockExams })
            .mockResolvedValueOnce({ rows: mockStudents });

        const result = await getGradebookData(mockClassId);

        expect(requireAuth).toHaveBeenCalledWith('gradebook:read');
        expect(pool.query).toHaveBeenNthCalledWith(3,
            expect.stringContaining('FROM students s'),
            [mockTenantId, mockClassId]
        );
        expect(result).toEqual({
            classes: mockClasses,
            exams: mockExams,
            students: mockStudents,
        });
    });

    it('should throw an error if requireAuth fails', async () => {
        (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

        await expect(getGradebookData()).rejects.toThrow('Unauthorized');
        expect(pool.query).not.toHaveBeenCalled();
    });
});
