import {
    getVerificationStats,
    rejectExamResults,
    verifyExamResults,
} from '@/lib/actions/exam-review';
import { getExamSchedules } from '@/lib/actions/exams';
import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn(), query: jest.fn() },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));

const TENANT_ID = '389b4bb5-56a9-46dc-a7c0-2fcf664f054b';
const USER_ID = '1c1c3c14-28d5-422d-9c22-a313b65a237e';
const RESULT_ID = '7485b6aa-ddd1-4a50-91ee-431997088044';
const SCHEDULE_ID = '4f4397bf-b71a-48a9-ac36-5543e6ee5169';
const STUDENT_ID = 'c8d78763-54ce-4f5f-a563-83035d18cdbe';
const EXAM_ID = '2ae61146-a50a-44e7-a65a-50301c2e1703';
const GRADE_ID = '9dde1fbc-dc88-4e6f-9b08-b09f22331eca';

function normalizedSql(statement: unknown): string {
    return String(statement).replace(/\s+/g, ' ').trim();
}

function lockedResult(overrides: Record<string, unknown> = {}) {
    return {
        id: RESULT_ID,
        studentId: STUDENT_ID,
        examScheduleId: SCHEDULE_ID,
        marksObtained: '88.50',
        maxMarks: '100.00',
        grade: 'A',
        isAbsent: false,
        reviewStatus: 'PENDING',
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        examStatus: 'RESULT_REVIEW',
        hashId: null,
        hashLockedBy: null,
        hashLockedAt: null,
        ...overrides,
    };
}

describe('persisted exam-result review', () => {
    const query = jest.fn();
    const release = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: TENANT_ID, userId: USER_ID });
        query.mockImplementation(async (statement: string) => {
            if (normalizedSql(statement).includes('FOR UPDATE OF e, sr')) {
                return { rows: [lockedResult()] };
            }
            return { rows: [] };
        });
        (pool.connect as jest.Mock).mockResolvedValue({ query, release });
    });

    it('verifies a tenant result, creates its immutable hash, and audits in one transaction', async () => {
        const result = await verifyExamResults([RESULT_ID]);

        expect(requireAuth).toHaveBeenCalledWith('exams:review');
        expect(result).toEqual({ success: true, reviewed: 1, unchanged: 0 });

        const lock = query.mock.calls.find(call => normalizedSql(call[0]).includes('FOR UPDATE OF e, sr'));
        expect(lock?.[1]).toEqual([TENANT_ID, [RESULT_ID]]);

        const hashInsert = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('INSERT INTO exam_result_hashes'));
        expect(hashInsert?.[1]).toEqual(expect.arrayContaining([TENANT_ID, RESULT_ID, expect.any(String), expect.any(Date), USER_ID]));

        const reviewUpdate = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('UPDATE student_results'));
        expect(reviewUpdate?.[1]).toEqual([USER_ID, expect.any(Date), RESULT_ID, TENANT_ID]);

        const auditInsert = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'));
        expect(auditInsert?.[1]).toEqual(expect.arrayContaining([TENANT_ID, USER_ID, RESULT_ID]));
        expect(String(auditInsert?.[1]?.[6])).toContain('"status":"VERIFIED"');

        expect(query).toHaveBeenCalledWith('BEGIN');
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(revalidatePath).toHaveBeenCalledWith('/exams/verification');
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('is idempotent when a selected result is already verified', async () => {
        query.mockImplementation(async (statement: string) => {
            if (normalizedSql(statement).includes('FOR UPDATE OF e, sr')) {
                return { rows: [lockedResult({ reviewStatus: 'VERIFIED', examStatus: 'PUBLISHED', hashId: 'hash-id' })] };
            }
            return { rows: [] };
        });

        const result = await verifyExamResults([RESULT_ID, RESULT_ID]);

        expect(result).toEqual({ success: true, reviewed: 0, unchanged: 1 });
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('INSERT INTO exam_result_hashes'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('UPDATE student_results'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'))).toBe(false);
        expect(query).toHaveBeenCalledWith('COMMIT');
    });

    it('persists rejection metadata without deleting the result and audits the decision', async () => {
        const result = await rejectExamResults([RESULT_ID], 'Marks do not match the signed answer sheet.');

        expect(requireAuth).toHaveBeenCalledWith('exams:review');
        expect(result).toEqual({ success: true, reviewed: 1, unchanged: 0 });

        const reviewUpdate = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('UPDATE student_results'));
        expect(reviewUpdate?.[1]).toEqual([
            'Marks do not match the signed answer sheet.',
            USER_ID,
            expect.any(Date),
            RESULT_ID,
            TENANT_ID,
        ]);
        expect(normalizedSql(reviewUpdate?.[0])).toContain("review_status = 'REJECTED'");
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('DELETE FROM student_results'))).toBe(false);

        const auditInsert = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'));
        expect(String(auditInsert?.[1]?.[6])).toContain('signed answer sheet');
        expect(query).toHaveBeenCalledWith('COMMIT');
    });

    it.each([
        ['missing marks', { marksObtained: null, isAbsent: false }],
        ['marks above the schedule maximum', { marksObtained: '101.00' }],
        ['absent result with awarded marks', { marksObtained: '1.00', isAbsent: true }],
    ])('refuses to verify an incomplete or invalid result: %s', async (_label, overrides) => {
        query.mockImplementation(async (statement: string) => {
            if (normalizedSql(statement).includes('FOR UPDATE OF e, sr')) {
                return { rows: [lockedResult(overrides)] };
            }
            return { rows: [] };
        });

        const result = await verifyExamResults([RESULT_ID]);

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'CONFLICT' }));
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('INSERT INTO exam_result_hashes'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('UPDATE student_results'))).toBe(false);
    });

    it('fails closed when any selected id is outside the session tenant', async () => {
        query.mockImplementation(async (statement: string) => {
            if (normalizedSql(statement).includes('FOR UPDATE OF e, sr')) return { rows: [] };
            return { rows: [] };
        });

        const result = await rejectExamResults([RESULT_ID], 'Incorrect source record.');

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'NOT_FOUND' }));
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('UPDATE student_results'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'))).toBe(false);
    });

    it('rejects malformed input before opening a transaction', async () => {
        const invalidId = await verifyExamResults(['client-result-id']);
        const invalidReason = await rejectExamResults([RESULT_ID], 'bad');

        expect(invalidId).toEqual(expect.objectContaining({ success: false, code: 'INVALID_INPUT' }));
        expect(invalidReason).toEqual(expect.objectContaining({ success: false, code: 'INVALID_INPUT' }));
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('uses one tenant-scoped aggregate for truthful review counts', async () => {
        (pool.query as jest.Mock).mockResolvedValue({ rows: [{ pending: 7, verified: 11, rejected: 3 }] });

        const result = await getVerificationStats();

        expect(result).toEqual({ pending: 7, verified: 11, rejected: 3 });
        expect(requireAuth).toHaveBeenCalledWith('exams:review');
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("review_status = 'REJECTED'"), [TENANT_ID]);
    });

    it('returns schedule grade ids and counts only session-tenant results', async () => {
        (pool.query as jest.Mock)
            .mockResolvedValueOnce({
                rows: [{
                    id: SCHEDULE_ID,
                    gradeId: GRADE_ID,
                    gradeName: 'Grade 8',
                    subjectName: 'Mathematics',
                    examDate: '2026-08-01',
                    startTime: '09:00',
                    endTime: '10:00',
                    maxMarks: '100.00',
                    passingMarks: '40.00',
                    roomNumber: null,
                }],
            })
            .mockResolvedValueOnce({ rows: [{ count: '18' }] });

        const result = await getExamSchedules(EXAM_ID);

        expect(result).toEqual([expect.objectContaining({ gradeId: GRADE_ID, resultCount: 18 })]);
        expect(requireAuth).toHaveBeenCalledWith('exams:read');
        const countCall = (pool.query as jest.Mock).mock.calls[1];
        expect(normalizedSql(countCall[0])).toContain('tenant_id = $2');
        expect(countCall[1]).toEqual([SCHEDULE_ID, TENANT_ID]);
    });
});
