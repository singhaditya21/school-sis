import { GET as getReceiptPdf } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getReportCardPdf } from '@/app/api/report-cards/[studentId]/[termId]/route';
import { requireApiAuth } from '@/lib/auth/api';
import { pool, runWithTenantContext } from '@/lib/db';

jest.mock('@/lib/auth/api', () => ({
  requireApiAuth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
  runWithTenantContext: jest.fn((_tenantId: string, operation: () => unknown) => operation()),
}));

jest.mock('@/lib/observability/logger', () => ({
  logger: { error: jest.fn() },
  requestContextFrom: jest.fn(() => ({ requestId: 'request-1', traceId: null })),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECEIPT_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const TERM_ID = '55555555-5555-4555-8555-555555555555';

async function expectPdf(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
}

describe('native PDF routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireApiAuth as jest.Mock).mockResolvedValue({
      ok: true,
      context: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: 'SCHOOL_ADMIN',
        email: 'admin@school.example.edu',
      },
    });
  });

  it('renders a tenant-scoped receipt with an explicit ownership boundary', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        receiptNumber: 'RCPT-42',
        issuedAt: new Date('2026-08-07T10:00:00.000Z'),
        schoolName: 'Greenwood School',
        studentName: 'Asha Singh',
        admissionNumber: 'ADM-42',
        amount: '12500',
        method: 'CARD',
        transactionId: 'txn-42',
        invoiceNumber: 'INV-42',
      }],
    });

    const response = await getReceiptPdf(
      new Request(`https://school.example.edu/api/receipts/${RECEIPT_ID}/pdf`),
      { params: Promise.resolve({ id: RECEIPT_ID }) },
    );

    await expectPdf(response);
    expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    const [sql, values] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('WHERE r.tenant_id = $1');
    expect(sql).toContain('s.user_id = $4');
    expect(sql).toContain('FROM guardians g');
    expect(values).toEqual([TENANT_ID, RECEIPT_ID, true, USER_ID]);
  });

  it('renders only published, tenant-scoped report-card results', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          schoolName: 'Greenwood School',
          studentName: 'Asha Singh',
          admissionNumber: 'ADM-42',
          gradeName: 'Grade 8',
          sectionName: 'A',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          examId: '44444444-4444-4444-8444-444444444444',
          examName: 'Term 1',
          academicYear: '2026-2027',
          subject: 'Mathematics',
          marksObtained: '88',
          maxMarks: '100',
          grade: 'A',
          absent: false,
        }],
      });

    const response = await getReportCardPdf(
      new Request(`https://school.example.edu/api/report-cards/${STUDENT_ID}/current`),
      { params: Promise.resolve({ studentId: STUDENT_ID, termId: 'current' }) },
    );

    await expectPdf(response);
    expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    const [studentSql, studentValues] = (pool.query as jest.Mock).mock.calls[0];
    const [resultsSql, resultsValues] = (pool.query as jest.Mock).mock.calls[1];
    expect(studentSql).toContain('WHERE s.tenant_id = $1');
    expect(studentSql).toContain('FROM guardians guardian');
    expect(studentValues).toEqual([TENANT_ID, STUDENT_ID, true, USER_ID, false]);
    expect(resultsSql).toContain("e.status = 'PUBLISHED'");
    expect(resultsSql).toContain('FROM requested_term term');
    expect(resultsSql).toContain('result.tenant_id = $1');
    expect(resultsValues).toEqual([TENANT_ID, STUDENT_ID, 'current']);
  });

  it('limits teachers to their class-teacher or timetable-assigned sections', async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      ok: true,
      context: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: 'TEACHER',
        email: 'teacher@school.example.edu',
      },
    });
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const response = await getReportCardPdf(
      new Request(`https://school.example.edu/api/report-cards/${STUDENT_ID}/current`),
      { params: Promise.resolve({ studentId: STUDENT_ID, termId: 'current' }) },
    );

    expect(response.status).toBe(404);
    const [studentSql, studentValues] = (pool.query as jest.Mock).mock.calls[0];
    expect(studentSql).toContain('sec.class_teacher_id = $4');
    expect(studentSql).toContain('FROM timetable_entries entry');
    expect(studentSql).toContain('entry.section_id = s.section_id');
    expect(studentValues).toEqual([TENANT_ID, STUDENT_ID, false, USER_ID, true]);
  });

  it('supports guardian ownership and resolves a real term id by academic-year dates', async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      ok: true,
      context: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: 'PARENT',
        email: 'parent@school.example.edu',
      },
    });
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          schoolName: 'Greenwood School',
          studentName: 'Asha Singh',
          admissionNumber: 'ADM-42',
          gradeName: 'Grade 8',
          sectionName: 'A',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          examId: '44444444-4444-4444-8444-444444444444',
          examName: 'Term 1',
          academicYear: '2026-2027',
          subject: 'Mathematics',
          marksObtained: '88',
          maxMarks: '100',
          grade: 'A',
          absent: false,
        }],
      });

    const response = await getReportCardPdf(
      new Request(`https://school.example.edu/api/report-cards/${STUDENT_ID}/${TERM_ID}`),
      { params: Promise.resolve({ studentId: STUDENT_ID, termId: TERM_ID }) },
    );

    await expectPdf(response);
    const [studentSql, studentValues] = (pool.query as jest.Mock).mock.calls[0];
    const [resultsSql, resultsValues] = (pool.query as jest.Mock).mock.calls[1];
    expect(studentSql).toContain('FROM guardians guardian');
    expect(studentValues).toEqual([TENANT_ID, STUDENT_ID, false, USER_ID, false]);
    expect(resultsSql).toContain('FROM terms term');
    expect(resultsSql).toContain('term.id::text = $3');
    expect(resultsSql).toContain('e.start_date >= term.start_date');
    expect(resultsValues).toEqual([TENANT_ID, STUDENT_ID, TERM_ID]);
  });

  it('rejects malformed identifiers before querying the database', async () => {
    const response = await getReceiptPdf(
      new Request('https://school.example.edu/api/receipts/not-a-uuid/pdf'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
    expect(runWithTenantContext).not.toHaveBeenCalled();
  });
});
