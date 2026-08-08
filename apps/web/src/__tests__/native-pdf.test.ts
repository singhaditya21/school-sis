import { renderReceiptPdf, renderReportCardPdf } from '@/lib/pdf/native';

function pdfHeader(bytes: Uint8Array): string {
  return Buffer.from(bytes.slice(0, 5)).toString('ascii');
}

describe('native PDF generation', () => {
  it('generates a receipt PDF without an external renderer', () => {
    const bytes = renderReceiptPdf({
      schoolName: 'Greenwood School',
      receiptNumber: 'RCPT-2026-0042',
      issuedAt: '2026-08-07T12:00:00.000Z',
      studentName: 'Asha Singh',
      admissionNumber: 'ADM-42',
      amount: '12500.00',
      method: 'CARD',
      transactionId: 'txn_test_42',
      invoiceNumber: 'INV-42',
    });

    expect(pdfHeader(bytes)).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it('generates a report-card PDF from published result data', () => {
    const bytes = renderReportCardPdf({
      schoolName: 'Greenwood School',
      examName: 'Term 1',
      academicYear: '2026-2027',
      studentName: 'Asha Singh',
      admissionNumber: 'ADM-42',
      gradeName: 'Grade 8',
      sectionName: 'A',
      subjects: [
        { subject: 'Mathematics', marksObtained: '88', maxMarks: '100', grade: 'A' },
        { subject: 'Science', marksObtained: null, maxMarks: '100', grade: null, absent: true },
      ],
    });

    expect(pdfHeader(bytes)).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it('paginates long report cards instead of truncating subject results', () => {
    const bytes = renderReportCardPdf({
      schoolName: 'Greenwood School',
      examName: 'Annual Examination',
      academicYear: '2026-2027',
      studentName: 'Asha Singh',
      admissionNumber: 'ADM-42',
      gradeName: 'Grade 8',
      sectionName: 'A',
      subjects: Array.from({ length: 60 }, (_, index) => ({
        subject: `Subject ${index + 1}`,
        marksObtained: '80',
        maxMarks: '100',
        grade: 'A',
      })),
    });

    const pageObjects = Buffer.from(bytes)
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? [];
    expect(pageObjects.length).toBeGreaterThan(1);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
  });
});
