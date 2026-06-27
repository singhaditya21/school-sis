import { getLibraryStudents, getLibraryHistory } from '@/lib/services/library/library.service';
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

describe('Library Service - getLibraryStudents', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should require library:read permission and query database for students with tenantId', async () => {
        const mockTenantId = 'tenant-lib-123';
        const mockRows = [
            { id: 'stud-1', admissionNo: 'A101', name: 'Alice Smith', class: 'Grade 5-A' },
            { id: 'stud-2', admissionNo: 'A102', name: 'Bob Jones', class: 'Grade 5-B' },
        ];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

        const result = await getLibraryStudents();

        expect(requireAuth).toHaveBeenCalledWith('library:read');
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM students s'),
            [mockTenantId]
        );
        expect(result).toEqual(mockRows);
    });

    it('should throw an error if requireAuth fails for getLibraryStudents', async () => {
        (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

        await expect(getLibraryStudents()).rejects.toThrow('Unauthorized');
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('Library Service - getLibraryHistory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should require library:read permission and query database for history with tenantId', async () => {
        const mockTenantId = 'tenant-lib-123';
        const mockRows = [
            { id: 'issue-1', bookTitle: 'Introduction to Algorithms', studentName: 'Alice Smith', status: 'ISSUED' },
            { id: 'issue-2', bookTitle: 'Clean Code', studentName: 'Bob Jones', status: 'RETURNED' },
        ];

        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });
        (pool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

        const result = await getLibraryHistory();

        expect(requireAuth).toHaveBeenCalledWith('library:read');
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM book_issues bi'),
            [mockTenantId]
        );
        expect(result).toEqual(mockRows);
    });

    it('should throw an error if requireAuth fails for getLibraryHistory', async () => {
        (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

        await expect(getLibraryHistory()).rejects.toThrow('Unauthorized');
        expect(pool.query).not.toHaveBeenCalled();
    });
});
