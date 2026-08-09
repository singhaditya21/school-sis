import { pool } from '@/lib/db';
import type { ApiAuthContext } from '@/lib/auth/api';
import { loadReceiptDocument, loadReportCardDocument } from '@/lib/documents/native-pdf';

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '22dc245b-c099-4cba-b045-414020dadf7f';
const OTHER_USER_ID = '1b012d8a-30b6-4ea7-9aa7-c1160c25d9b8';
const RECEIPT_ID = '4f4397bf-b71a-48a9-ac36-5543e6ee5169';
const STUDENT_ID = 'b66175fc-8dae-4124-8a28-b8fe06fe4d47';
const TERM_ID = 'af571f63-51dd-4884-a541-f2d857be90ae';
const ACADEMIC_YEAR_ID = 'f9656a97-99f8-4923-9009-23547f9ebc17';

const query = pool.query as jest.Mock;

function auth(role: string, userId = USER_ID): ApiAuthContext {
    return { role, userId, tenantId: TENANT_ID, email: 'user@example.edu' };
}

function receiptRow(guardianUserIds: string[] = [USER_ID]) {
    return {
        id: RECEIPT_ID,
        receiptNumber: 'RCP-42',
        issuedAt: '2026-08-09T08:00:00.000Z',
        amount: '1234.50',
        currency: 'INR',
        paymentMethod: 'UPI',
        paymentStatus: 'COMPLETED',
        paidAt: '2026-08-09T07:55:00.000Z',
        transactionId: 'UPI-42',
        invoiceNumber: 'INV-42',
        studentId: STUDENT_ID,
        studentUserId: OTHER_USER_ID,
        studentName: 'Aarav Sharma',
        guardianUserIds,
        tenantName: 'Test School',
        tenantAddress: null,
        tenantCity: null,
        tenantState: null,
        tenantPincode: null,
        tenantEmail: null,
        tenantPhone: null,
    };
}

function reportHeader(overrides: Record<string, unknown> = {}) {
    return {
        studentId: STUDENT_ID,
        studentUserId: USER_ID,
        studentName: 'Aarav Sharma',
        admissionNumber: 'ADM-42',
        rollNumber: 12,
        gradeName: 'Grade 8',
        sectionName: 'A',
        guardianUserIds: [OTHER_USER_ID],
        tenantName: 'Test School',
        tenantAddress: null,
        termId: TERM_ID,
        termName: 'Term 1',
        academicYearName: '2026-2027',
        termStartDate: '2026-06-01',
        termEndDate: '2026-09-30',
        academicYearId: ACADEMIC_YEAR_ID,
        ...overrides,
    };
}

describe('native PDF document access service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('scopes receipt lookup to the session tenant', async () => {
        query.mockResolvedValueOnce({ rows: [receiptRow()] });

        const result = await loadReceiptDocument(auth('SCHOOL_ADMIN'), RECEIPT_ID);

        expect(result.kind).toBe('found');
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][1]).toEqual([RECEIPT_ID, TENANT_ID]);
        expect(query.mock.calls[0][0]).toContain('r.tenant_id = $2');
    });

    it('returns 404 semantics for cross-tenant or absent receipts', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const result = await loadReceiptDocument(auth('SCHOOL_ADMIN'), RECEIPT_ID);

        expect(result).toEqual({ kind: 'not_found' });
        expect(query.mock.calls[0][1]).toEqual([RECEIPT_ID, TENANT_ID]);
    });

    it('forbids a parent who is not linked to the receipt student', async () => {
        query.mockResolvedValueOnce({ rows: [receiptRow([OTHER_USER_ID])] });

        const result = await loadReceiptDocument(auth('PARENT'), RECEIPT_ID);

        expect(result).toEqual({ kind: 'forbidden' });
    });

    it('rejects staff without receipt permission before querying', async () => {
        const result = await loadReceiptDocument(auth('ADMISSION_COUNSELOR'), RECEIPT_ID);

        expect(result).toEqual({ kind: 'forbidden' });
        expect(query).not.toHaveBeenCalled();
    });

    it('allows only the linked student to read a report card and preserves exact marks', async () => {
        query
            .mockResolvedValueOnce({ rows: [reportHeader()] })
            .mockResolvedValueOnce({ rows: [{
                examId: '05cc875d-4dc3-4ad1-8ab2-aa688223ef4f',
                examName: 'Term 1 Examination',
                subjectName: 'Mathematics',
                marksObtained: '88.50',
                maxMarks: '100.00',
                grade: 'A',
                remarks: null,
                isAbsent: false,
            }] });

        const result = await loadReportCardDocument(auth('STUDENT'), STUDENT_ID, TERM_ID);

        expect(result.kind).toBe('found');
        if (result.kind === 'found') {
            expect(result.data.results[0]).toMatchObject({
                marksObtained: '88.50',
                maxMarks: '100.00',
            });
        }
        expect(query.mock.calls[0][1]).toEqual([STUDENT_ID, TENANT_ID, TERM_ID]);
        expect(query.mock.calls[1][1]).toEqual([
            TENANT_ID,
            STUDENT_ID,
            ACADEMIC_YEAR_ID,
            '2026-06-01',
            '2026-09-30',
        ]);
    });

    it('forbids an unlinked parent without reading result rows', async () => {
        query.mockResolvedValueOnce({ rows: [reportHeader({ studentUserId: OTHER_USER_ID })] });

        const result = await loadReportCardDocument(auth('PARENT'), STUDENT_ID, TERM_ID);

        expect(result).toEqual({ kind: 'forbidden' });
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns not found when no published results exist for the selected term', async () => {
        query
            .mockResolvedValueOnce({ rows: [reportHeader()] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await loadReportCardDocument(auth('SCHOOL_ADMIN'), STUDENT_ID, TERM_ID);

        expect(result).toEqual({ kind: 'not_found' });
    });
});
