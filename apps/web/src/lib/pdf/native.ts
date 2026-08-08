import { jsPDF } from 'jspdf';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 48;
const RIGHT = PAGE_WIDTH - 48;
const REPORT_CONTENT_BOTTOM = 744;

function clean(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return (normalized || fallback).slice(0, 180);
}

function formatDate(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? clean(value)
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(parsed);
}

function formatCurrency(value: string | number): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
    : clean(value);
}

function header(doc: jsPDF, schoolName: string, title: string, subtitle: string): number {
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(clean(schoolName, 'School SIS'), PAGE_WIDTH / 2, 50, { align: 'center' });
  doc.setFontSize(14);
  doc.text(title, PAGE_WIDTH / 2, 76, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 98, 112);
  doc.text(clean(subtitle), PAGE_WIDTH / 2, 94, { align: 'center' });
  doc.setDrawColor(210, 215, 225);
  doc.line(LEFT, 108, RIGHT, 108);
  return 132;
}

function field(doc: jsPDF, label: string, value: unknown, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 88, 104);
  doc.text(label, LEFT, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 33, 61);
  doc.text(clean(value), 185, y);
  return y + 22;
}

function pdfBytes(doc: jsPDF): Uint8Array {
  return new Uint8Array(doc.output('arraybuffer'));
}

function fitText(doc: jsPDF, value: unknown, maxWidth: number): string {
  const text = clean(value);
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}…`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

export type ReceiptPdfData = {
  schoolName: string;
  receiptNumber: string;
  issuedAt: string | Date;
  studentName: string;
  admissionNumber: string;
  amount: string | number;
  method: string;
  transactionId?: string | null;
  invoiceNumber?: string | null;
};

export function renderReceiptPdf(data: ReceiptPdfData): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  let y = header(doc, data.schoolName, 'Payment Receipt', `Receipt ${clean(data.receiptNumber)}`);

  y = field(doc, 'Receipt number', data.receiptNumber, y);
  y = field(doc, 'Issued on', formatDate(data.issuedAt), y);
  y = field(doc, 'Student', data.studentName, y);
  y = field(doc, 'Admission number', data.admissionNumber, y);
  if (data.invoiceNumber) y = field(doc, 'Invoice number', data.invoiceNumber, y);
  y = field(doc, 'Payment method', data.method, y);
  if (data.transactionId) y = field(doc, 'Transaction reference', data.transactionId, y);

  doc.setFillColor(241, 247, 255);
  doc.roundedRect(LEFT, y + 4, RIGHT - LEFT, 58, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(50, 65, 90);
  doc.text('Amount received', LEFT + 16, y + 38);
  doc.setFontSize(16);
  doc.text(formatCurrency(data.amount), RIGHT - 16, y + 39, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 108, 124);
  doc.text('This receipt was generated from the tenant-scoped School SIS payment ledger.', PAGE_WIDTH / 2, 790, { align: 'center' });
  return pdfBytes(doc);
}

export type ReportCardSubject = {
  subject: string;
  marksObtained: string | number | null;
  maxMarks: string | number;
  grade?: string | null;
  absent?: boolean;
};

export type ReportCardPdfData = {
  schoolName: string;
  examName: string;
  academicYear: string;
  studentName: string;
  admissionNumber: string;
  gradeName: string;
  sectionName: string;
  subjects: ReportCardSubject[];
};

export function renderReportCardPdf(data: ReportCardPdfData): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const subtitle = `${clean(data.examName)} · ${clean(data.academicYear)}`;
  let y = header(doc, data.schoolName, 'Report Card', subtitle);

  y = field(doc, 'Student', data.studentName, y);
  y = field(doc, 'Admission number', data.admissionNumber, y);
  y = field(doc, 'Class', `${clean(data.gradeName)} · ${clean(data.sectionName)}`, y);
  y += 8;

  const columns = [LEFT, 295, 380, 465] as const;
  const drawTableHeader = (top: number): number => {
    doc.setFillColor(234, 239, 248);
    doc.rect(LEFT, top - 15, RIGHT - LEFT, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40, 52, 78);
    doc.text('Subject', columns[0] + 8, top + 2);
    doc.text('Marks', columns[1], top + 2);
    doc.text('Maximum', columns[2], top + 2);
    doc.text('Grade', columns[3], top + 2);
    doc.setFont('helvetica', 'normal');
    return top + 28;
  };
  y = drawTableHeader(y);

  let total = 0;
  let maximum = 0;
  for (const subject of data.subjects) {
    const obtained = subject.absent ? 0 : Number(subject.marksObtained ?? 0);
    const max = Number(subject.maxMarks);
    if (Number.isFinite(obtained)) total += obtained;
    if (Number.isFinite(max)) maximum += max;

    if (y + 24 > REPORT_CONTENT_BOTTOM) {
      doc.addPage();
      y = header(doc, data.schoolName, 'Report Card (continued)', subtitle);
      y = drawTableHeader(y);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 42, 65);
    doc.text(fitText(doc, subject.subject, columns[1] - columns[0] - 20), columns[0] + 8, y);
    doc.text(fitText(doc, subject.absent ? 'Absent' : subject.marksObtained, 72), columns[1], y);
    doc.text(fitText(doc, subject.maxMarks, 72), columns[2], y);
    doc.text(fitText(doc, subject.grade, RIGHT - columns[3]), columns[3], y);
    doc.setDrawColor(230, 233, 239);
    doc.line(LEFT, y + 8, RIGHT, y + 8);
    y += 24;
  }

  if (y + 78 > REPORT_CONTENT_BOTTOM) {
    doc.addPage();
    y = header(doc, data.schoolName, 'Report Card (continued)', subtitle);
  }

  const percentage = maximum > 0 ? (total / maximum) * 100 : 0;
  doc.setFillColor(241, 247, 255);
  doc.roundedRect(LEFT, y + 10, RIGHT - LEFT, 58, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${total.toFixed(2)} / ${maximum.toFixed(2)}`, LEFT + 16, y + 43);
  doc.text(`Percentage: ${percentage.toFixed(2)}%`, RIGHT - 16, y + 43, { align: 'right' });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 108, 124);
    doc.text(
      `Generated from published, tenant-scoped assessment results in School SIS · Page ${page} of ${pageCount}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - 32,
      { align: 'center' },
    );
  }
  return pdfBytes(doc);
}
