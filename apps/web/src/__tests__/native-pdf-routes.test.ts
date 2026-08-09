import { NextResponse } from 'next/server';

import { GET as getReceiptPdf } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getReportCardPdf } from '@/app/api/report-cards/[studentId]/[termId]/route';
import { requireApiAuth } from '@/lib/auth/api';
import {
    loadReceiptDocument,
    loadReportCardDocument,
    type ReceiptDocumentData,
    type ReportCardDocumentData,
} from '@/lib/documents/native-pdf';

jest.mock('@/lib/auth/api', () => ({ requireApiAuth: jest.fn() }));
jest.mock('@/lib/documents/native-pdf', () => {
    const actual = jest.requireActual('@/lib/documents/native-pdf');
    return {
        ...actual,
        loadReceiptDocument: jest.fn(),
        loadReportCardDocument: jest.fn(),
    };
});

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '22dc245b-c099-4cba-b045-414020dadf7f';
const RECEIPT_ID = '4f4397bf-b71a-48a9-ac36-5543e6ee5169';
const STUDENT_ID = 'b66175fc-8dae-4124-8a28-b8fe06fe4d47';
const TERM_ID = 'af571f63-51dd-4884-a541-f2d857be90ae';

const receiptData: ReceiptDocumentData = {
    id: RECEIPT_ID,
    receiptNumber: 'RCP-2026-0042',
    issuedAt: '2026-08-09T08:00:00.000Z',
    amount: '1234.50',
    currency: 'INR',
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'COMPLETED',
    paidAt: '2026-08-09T07:55:00.000Z',
    transactionId: 'BANK-EXACT-42',
    invoiceNumber: 'INV-2026-0042',
    studentId: STUDENT_ID,
    studentUserId: null,
    studentName: 'Aarav Sharma',
    guardianUserIds: [USER_ID],
    tenantName: 'ScholarMind Test School',
    tenantAddress: '12 Learning Road',
    tenantCity: 'Pune',
    tenantState: 'Maharashtra',
    tenantPincode: '411001',
    tenantEmail: 'office@example.edu',
    tenantPhone: '+91 20 1234 5678',
};

const reportCardData: ReportCardDocumentData = {
    studentId: STUDENT_ID,
    studentUserId: USER_ID,
    studentName: 'Aarav Sharma',
    admissionNumber: 'ADM-0042',
    rollNumber: 12,
    gradeName: 'Grade 8',
    sectionName: 'A',
    guardianUserIds: [],
    tenantName: 'ScholarMind Test School',
    tenantAddress: '12 Learning Road',
    termId: TERM_ID,
    termName: 'Term 1',
    academicYearName: '2026-2027',
    termStartDate: '2026-06-01',
    termEndDate: '2026-09-30',
    academicYearId: 'f9656a97-99f8-4923-9009-23547f9ebc17',
    results: [{
        examId: '05cc875d-4dc3-4ad1-8ab2-aa688223ef4f',
        examName: 'Term 1 Examination',
        subjectName: 'Mathematics',
        marksObtained: '88.50',
        maxMarks: '100.00',
        grade: 'A',
        remarks: 'Consistent work',
        isAbsent: false,
    }],
};

function authenticated(role = 'SCHOOL_ADMIN') {
    return {
        ok: true as const,
        context: {
            userId: USER_ID,
            tenantId: TENANT_ID,
            role,
            email: 'user@example.edu',
        },
    };
}

describe('native PDF routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireApiAuth as jest.Mock).mockResolvedValue(authenticated());
    });

    it('requires authentication before receipt lookup', async () => {
        (requireApiAuth as jest.Mock).mockResolvedValue({
            ok: false,
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        });

        const response = await getReceiptPdf(
            new Request(`https://school.example.edu/api/receipts/${RECEIPT_ID}/pdf`),
            { params: Promise.resolve({ id: RECEIPT_ID }) },
        );

        expect(response.status).toBe(401);
        expect(loadReceiptDocument).not.toHaveBeenCalled();
    });

    it('returns native receipt PDF bytes with the preserved filename and exact amount', async () => {
        (loadReceiptDocument as jest.Mock).mockResolvedValue({ kind: 'found', data: receiptData });

        const response = await getReceiptPdf(
            new Request(`https://school.example.edu/api/receipts/${RECEIPT_ID}/pdf`),
            { params: Promise.resolve({ id: RECEIPT_ID }) },
        );
        const bytes = Buffer.from(await response.arrayBuffer());

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/pdf');
        expect(response.headers.get('content-disposition')).toBe(`attachment; filename="receipt-${RECEIPT_ID}.pdf"`);
        expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(bytes.toString('latin1')).toContain('1,234.50');
    });

    it('maps forbidden and missing receipt lookups to honest statuses', async () => {
        (loadReceiptDocument as jest.Mock).mockResolvedValueOnce({ kind: 'forbidden' });
        const forbidden = await getReceiptPdf(new Request('https://school.example.edu'), {
            params: Promise.resolve({ id: RECEIPT_ID }),
        });
        expect(forbidden.status).toBe(403);

        (loadReceiptDocument as jest.Mock).mockResolvedValueOnce({ kind: 'not_found' });
        const missing = await getReceiptPdf(new Request('https://school.example.edu'), {
            params: Promise.resolve({ id: RECEIPT_ID }),
        });
        expect(missing.status).toBe(404);
    });

    it('returns native report-card PDF bytes with exact persisted marks', async () => {
        (loadReportCardDocument as jest.Mock).mockResolvedValue({ kind: 'found', data: reportCardData });

        const response = await getReportCardPdf(
            new Request(`https://school.example.edu/api/report-cards/${STUDENT_ID}/${TERM_ID}`),
            { params: Promise.resolve({ studentId: STUDENT_ID, termId: TERM_ID }) },
        );
        const bytes = Buffer.from(await response.arrayBuffer());

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/pdf');
        expect(response.headers.get('content-disposition')).toBe(`attachment; filename="report-card-${STUDENT_ID}.pdf"`);
        expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(bytes.toString('latin1')).toContain('88.50');
        expect(bytes.toString('latin1')).toContain('100.00');
    });

    it('labels a legacy missing mark instead of fabricating a zero score', async () => {
        const data: ReportCardDocumentData = {
            ...reportCardData,
            results: [{ ...reportCardData.results[0], marksObtained: null, isAbsent: false }],
        };
        (loadReportCardDocument as jest.Mock).mockResolvedValue({ kind: 'found', data });

        const response = await getReportCardPdf(new Request('https://school.example.edu'), {
            params: Promise.resolve({ studentId: STUDENT_ID, termId: TERM_ID }),
        });
        const bytes = Buffer.from(await response.arrayBuffer());

        expect(response.status).toBe(200);
        expect(bytes.toString('latin1')).toContain('Not recorded');
        expect(bytes.toString('latin1')).not.toContain('(0.00)');
    });

    it('returns 404 when the report-card source record is missing', async () => {
        (loadReportCardDocument as jest.Mock).mockResolvedValue({ kind: 'not_found' });

        const response = await getReportCardPdf(new Request('https://school.example.edu'), {
            params: Promise.resolve({ studentId: STUDENT_ID, termId: TERM_ID }),
        });

        expect(response.status).toBe(404);
    });
});
