import { jsPDF } from 'jspdf';
import { nativeThemes, nativeTokens } from '@school-sis/design-tokens/native';

import { pool } from '@/lib/db';
import type { ApiAuthContext } from '@/lib/auth/api';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PdfRgb = readonly [number, number, number];

function pdfRgb(hex: string): PdfRgb {
    const value = hex.replace(/^#/, '');
    return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16),
    ];
}

const PDF_COLOR = {
    brand: pdfRgb(nativeThemes.light.primary),
    brandMuted: pdfRgb(nativeTokens.color.indigo50),
    brandStrong: pdfRgb(nativeTokens.color.indigo700),
    foreground: pdfRgb(nativeThemes.light.foreground),
    mutedForeground: pdfRgb(nativeThemes.light.mutedForeground),
    subtleForeground: pdfRgb(nativeTokens.color.slate700),
    border: pdfRgb(nativeThemes.light.border),
    muted: pdfRgb(nativeThemes.light.muted),
    white: pdfRgb(nativeTokens.color.white),
} as const;

function setPdfFill(doc: jsPDF, color: PdfRgb): void {
    doc.setFillColor(color[0], color[1], color[2]);
}

function setPdfText(doc: jsPDF, color: PdfRgb): void {
    doc.setTextColor(color[0], color[1], color[2]);
}

function setPdfDraw(doc: jsPDF, color: PdfRgb): void {
    doc.setDrawColor(color[0], color[1], color[2]);
}

type DocumentLookup<T> =
    | { kind: 'found'; data: T }
    | { kind: 'forbidden' }
    | { kind: 'not_found' };

export interface ReceiptDocumentData {
    id: string;
    receiptNumber: string;
    issuedAt: Date | string;
    amount: string;
    currency: 'INR';
    paymentMethod: string;
    paymentStatus: string;
    paidAt: Date | string;
    transactionId: string | null;
    invoiceNumber: string;
    studentId: string;
    studentUserId: string | null;
    studentName: string;
    guardianUserIds: string[];
    tenantName: string;
    tenantAddress: string | null;
    tenantCity: string | null;
    tenantState: string | null;
    tenantPincode: string | null;
    tenantEmail: string | null;
    tenantPhone: string | null;
}

export interface ReportCardResultRow {
    examId: string;
    examName: string;
    subjectName: string;
    marksObtained: string | null;
    maxMarks: string;
    grade: string | null;
    remarks: string | null;
    isAbsent: boolean;
}

export interface ReportCardDocumentData {
    studentId: string;
    studentUserId: string | null;
    studentName: string;
    admissionNumber: string;
    rollNumber: number | null;
    gradeName: string;
    sectionName: string;
    guardianUserIds: string[];
    tenantName: string;
    tenantAddress: string | null;
    termId: string;
    termName: string;
    academicYearName: string;
    termStartDate: Date | string;
    termEndDate: Date | string;
    academicYearId: string;
    results: ReportCardResultRow[];
}

function roleHasPermission(role: string, permission: string): boolean {
    return hasPermission(role as UserRole, permission);
}

function guardianIds(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function canReadOwnedStudent(
    auth: ApiAuthContext,
    studentUserId: string | null,
    linkedGuardianUserIds: readonly string[],
): boolean {
    if (auth.role === 'PARENT') return linkedGuardianUserIds.includes(auth.userId);
    if (auth.role === 'STUDENT') return studentUserId === auth.userId;
    return true;
}

export async function loadReceiptDocument(
    auth: ApiAuthContext,
    receiptId: string,
): Promise<DocumentLookup<ReceiptDocumentData>> {
    if (!UUID_RE.test(receiptId)) return { kind: 'not_found' };

    const ownScoped = auth.role === 'PARENT' || auth.role === 'STUDENT';
    const permission = ownScoped ? 'receipts:read:own' : 'receipts:read';
    if (!roleHasPermission(auth.role, permission)) return { kind: 'forbidden' };

    const { rows } = await pool.query<ReceiptDocumentData & { guardianUserIds: unknown }>(
        `SELECT
            r.id,
            r.receipt_number AS "receiptNumber",
            r.issued_at AS "issuedAt",
            p.amount::text AS amount,
            'INR'::text AS currency,
            p.method AS "paymentMethod",
            p.status AS "paymentStatus",
            p.paid_at AS "paidAt",
            p.transaction_id AS "transactionId",
            i.invoice_number AS "invoiceNumber",
            s.id AS "studentId",
            s.user_id AS "studentUserId",
            CONCAT_WS(' ', s.first_name, s.last_name) AS "studentName",
            ARRAY(
                SELECT g.user_id::text
                FROM guardians g
                WHERE g.tenant_id = r.tenant_id
                  AND g.student_id = s.id
                  AND g.user_id IS NOT NULL
            ) AS "guardianUserIds",
            t.name AS "tenantName",
            t.address AS "tenantAddress",
            t.city AS "tenantCity",
            t.state AS "tenantState",
            t.pincode AS "tenantPincode",
            t.email AS "tenantEmail",
            t.phone AS "tenantPhone"
         FROM receipts r
         INNER JOIN payments p
            ON p.id = r.payment_id
           AND p.tenant_id = r.tenant_id
         INNER JOIN invoices i
            ON i.id = p.invoice_id
           AND i.tenant_id = r.tenant_id
           AND i.student_id = p.student_id
         INNER JOIN students s
            ON s.id = p.student_id
           AND s.tenant_id = r.tenant_id
         INNER JOIN tenants t ON t.id = r.tenant_id
         WHERE r.id = $1
           AND r.tenant_id = $2
         LIMIT 1`,
        [receiptId, auth.tenantId],
    );

    const row = rows[0];
    if (!row) return { kind: 'not_found' };

    const data: ReceiptDocumentData = {
        ...row,
        currency: 'INR',
        guardianUserIds: guardianIds(row.guardianUserIds),
    };

    if (ownScoped && !canReadOwnedStudent(auth, data.studentUserId, data.guardianUserIds)) {
        return { kind: 'forbidden' };
    }

    return { kind: 'found', data };
}

export async function loadReportCardDocument(
    auth: ApiAuthContext,
    studentId: string,
    termId: string,
): Promise<DocumentLookup<ReportCardDocumentData>> {
    if (!UUID_RE.test(studentId) || (termId !== 'current' && !UUID_RE.test(termId))) {
        return { kind: 'not_found' };
    }

    const ownScoped = auth.role === 'PARENT' || auth.role === 'STUDENT';
    const permission = ownScoped ? 'gradebook:read:own' : 'exams:read';
    if (!roleHasPermission(auth.role, permission)) return { kind: 'forbidden' };

    const { rows: headerRows } = await pool.query<Omit<ReportCardDocumentData, 'results'> & { guardianUserIds: unknown }>(
        `WITH selected_term AS (
            SELECT
                tr.id,
                tr.name,
                tr.start_date,
                tr.end_date,
                tr.academic_year_id,
                ay.name AS academic_year_name
            FROM terms tr
            INNER JOIN academic_years ay
                ON ay.id = tr.academic_year_id
               AND ay.tenant_id = tr.tenant_id
            WHERE tr.tenant_id = $2
              AND (
                    ($3 = 'current' AND ay.is_current = TRUE)
                 OR tr.id::text = $3
              )
            ORDER BY
                CASE WHEN CURRENT_DATE BETWEEN tr.start_date AND tr.end_date THEN 0 ELSE 1 END,
                tr.end_date DESC
            LIMIT 1
        )
        SELECT
            s.id AS "studentId",
            s.user_id AS "studentUserId",
            CONCAT_WS(' ', s.first_name, s.last_name) AS "studentName",
            s.admission_number AS "admissionNumber",
            s.roll_number AS "rollNumber",
            gr.name AS "gradeName",
            sec.name AS "sectionName",
            ARRAY(
                SELECT g.user_id::text
                FROM guardians g
                WHERE g.tenant_id = s.tenant_id
                  AND g.student_id = s.id
                  AND g.user_id IS NOT NULL
            ) AS "guardianUserIds",
            tn.name AS "tenantName",
            tn.address AS "tenantAddress",
            st.id AS "termId",
            st.name AS "termName",
            st.academic_year_name AS "academicYearName",
            st.start_date AS "termStartDate",
            st.end_date AS "termEndDate",
            st.academic_year_id AS "academicYearId"
        FROM students s
        INNER JOIN grades gr
            ON gr.id = s.grade_id
           AND gr.tenant_id = s.tenant_id
        INNER JOIN sections sec
            ON sec.id = s.section_id
           AND sec.tenant_id = s.tenant_id
        INNER JOIN tenants tn ON tn.id = s.tenant_id
        CROSS JOIN selected_term st
        WHERE s.id = $1
          AND s.tenant_id = $2
        LIMIT 1`,
        [studentId, auth.tenantId, termId],
    );

    const header = headerRows[0];
    if (!header) return { kind: 'not_found' };

    const normalizedGuardianIds = guardianIds(header.guardianUserIds);
    if (ownScoped && !canReadOwnedStudent(auth, header.studentUserId, normalizedGuardianIds)) {
        return { kind: 'forbidden' };
    }

    const { rows: results } = await pool.query<ReportCardResultRow>(
        `SELECT
            e.id AS "examId",
            e.name AS "examName",
            sub.name AS "subjectName",
            sr.marks_obtained::text AS "marksObtained",
            es.max_marks::text AS "maxMarks",
            sr.grade,
            sr.remarks,
            sr.is_absent AS "isAbsent"
         FROM student_results sr
         INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         INNER JOIN exams e
            ON e.id = es.exam_id
           AND e.tenant_id = sr.tenant_id
         INNER JOIN subjects sub
            ON sub.id = es.subject_id
           AND sub.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND sr.student_id = $2
           AND e.academic_year_id = $3
           AND e.status = 'PUBLISHED'
           AND e.start_date <= $5::date
           AND e.end_date >= $4::date
         ORDER BY e.start_date, e.name, sub.name`,
        [auth.tenantId, studentId, header.academicYearId, header.termStartDate, header.termEndDate],
    );

    if (results.length === 0) return { kind: 'not_found' };

    return {
        kind: 'found',
        data: {
            ...header,
            guardianUserIds: normalizedGuardianIds,
            results,
        },
    };
}

function cleanText(value: unknown): string {
    return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim();
}

function formatDate(value: Date | string): string {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return cleanText(value);
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(parsed);
}

function formatDecimalExact(value: string, minimumFractionDigits = 2): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error('Invalid decimal value in document source data.');

    const [, sign, rawInteger, rawFraction = ''] = match;
    const integer = rawInteger.replace(/^0+(?=\d)/, '');
    const lastThree = integer.slice(-3);
    const leading = integer.slice(0, -3);
    const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    const groupedInteger = leading ? `${groupedLeading},${lastThree}` : lastThree;
    const fraction = rawFraction.padEnd(minimumFractionDigits, '0');
    return `${sign}${groupedInteger}${fraction ? `.${fraction}` : ''}`;
}

function createDocument(title: string): jsPDF {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: false,
        putOnlyUsedFonts: true,
    });
    doc.setProperties({
        title,
        subject: title,
        author: 'ScholarMind',
        creator: 'ScholarMind',
    });
    return doc;
}

function drawBrandHeader(doc: jsPDF, tenantName: string, documentTitle: string): void {
    setPdfFill(doc, PDF_COLOR.brand);
    doc.rect(0, 0, 210, 32, 'F');
    setPdfText(doc, PDF_COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ScholarMind', 16, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanText(tenantName), 16, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(documentTitle, 194, 17, { align: 'right' });
}

function drawPageFooter(doc: jsPDF, note: string): void {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        setPdfDraw(doc, PDF_COLOR.border);
        doc.line(16, 282, 194, 282);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setPdfText(doc, PDF_COLOR.mutedForeground);
        doc.text(note, 16, 288);
        doc.text(`Page ${page} of ${pages}`, 194, 288, { align: 'right' });
    }
}

export function renderReceiptPdf(data: ReceiptDocumentData): ArrayBuffer {
    const doc = createDocument(`Receipt ${data.receiptNumber}`);
    drawBrandHeader(doc, data.tenantName, 'PAYMENT RECEIPT');

    setPdfText(doc, PDF_COLOR.foreground);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(cleanText(data.receiptNumber), 16, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setPdfText(doc, PDF_COLOR.mutedForeground);
    doc.text(`Issued ${formatDate(data.issuedAt)}`, 16, 55);

    setPdfFill(doc, PDF_COLOR.brandMuted);
    doc.roundedRect(128, 41, 66, 22, 2, 2, 'F');
    setPdfText(doc, PDF_COLOR.subtleForeground);
    doc.setFontSize(8);
    doc.text('AMOUNT RECEIVED', 133, 48);
    setPdfText(doc, PDF_COLOR.brandStrong);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${data.currency} ${formatDecimalExact(data.amount)}`, 133, 57);

    const rows: Array<[string, string]> = [
        ['Student', data.studentName],
        ['Invoice', data.invoiceNumber],
        ['Payment date', formatDate(data.paidAt)],
        ['Payment method', data.paymentMethod.replace(/_/g, ' ')],
        ['Payment status', data.paymentStatus],
    ];
    if (data.transactionId) rows.push(['Transaction reference', data.transactionId]);

    let y = 78;
    doc.setFontSize(9);
    for (const [label, rawValue] of rows) {
        doc.setFont('helvetica', 'normal');
        setPdfText(doc, PDF_COLOR.mutedForeground);
        doc.text(label.toUpperCase(), 16, y);
        doc.setFont('helvetica', 'bold');
        setPdfText(doc, PDF_COLOR.foreground);
        const valueLines = doc.splitTextToSize(cleanText(rawValue), 112) as string[];
        doc.text(valueLines, 72, y);
        y += Math.max(12, valueLines.length * 5 + 5);
        setPdfDraw(doc, PDF_COLOR.border);
        doc.line(16, y - 6, 194, y - 6);
    }

    const addressParts = [data.tenantAddress, data.tenantCity, data.tenantState, data.tenantPincode]
        .filter(Boolean)
        .map(cleanText);
    const contactParts = [data.tenantEmail, data.tenantPhone].filter(Boolean).map(cleanText);
    if (addressParts.length > 0 || contactParts.length > 0) {
        y += 4;
        doc.setFont('helvetica', 'bold');
        setPdfText(doc, PDF_COLOR.foreground);
        doc.text(cleanText(data.tenantName), 16, y);
        doc.setFont('helvetica', 'normal');
        setPdfText(doc, PDF_COLOR.mutedForeground);
        const contact = [...addressParts, ...contactParts].join(' | ');
        doc.text(doc.splitTextToSize(contact, 178) as string[], 16, y + 6);
    }

    drawPageFooter(doc, 'System-generated receipt from persisted payment records.');
    return doc.output('arraybuffer');
}

function drawReportTableHeader(doc: jsPDF, y: number): number {
    setPdfFill(doc, PDF_COLOR.muted);
    doc.rect(16, y, 178, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setPdfText(doc, PDF_COLOR.subtleForeground);
    doc.text('EXAM', 18, y + 6);
    doc.text('SUBJECT', 64, y + 6);
    doc.text('MARKS', 124, y + 6);
    doc.text('MAX', 147, y + 6);
    doc.text('GRADE', 168, y + 6);
    return y + 9;
}

export function renderReportCardPdf(data: ReportCardDocumentData): ArrayBuffer {
    const doc = createDocument(`Report card ${data.studentName} - ${data.termName}`);
    drawBrandHeader(doc, data.tenantName, 'REPORT CARD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    setPdfText(doc, PDF_COLOR.foreground);
    doc.text(cleanText(data.studentName), 16, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setPdfText(doc, PDF_COLOR.subtleForeground);
    doc.text(`Admission: ${cleanText(data.admissionNumber)}`, 16, 54);
    doc.text(`Class: ${cleanText(data.gradeName)} - ${cleanText(data.sectionName)}`, 72, 54);
    doc.text(`Roll: ${data.rollNumber ?? '-'}`, 142, 54);
    doc.text(`${cleanText(data.termName)} | ${cleanText(data.academicYearName)}`, 16, 61);
    doc.text(`${formatDate(data.termStartDate)} - ${formatDate(data.termEndDate)}`, 194, 61, { align: 'right' });

    let y = drawReportTableHeader(doc, 69);
    doc.setFontSize(8);

    for (const result of data.results) {
        const examLines = doc.splitTextToSize(cleanText(result.examName), 42) as string[];
        const subjectLines = doc.splitTextToSize(cleanText(result.subjectName), 54) as string[];
        const remarksLines = result.remarks
            ? doc.splitTextToSize(`Remarks: ${cleanText(result.remarks)}`, 174) as string[]
            : [];
        const contentLines = Math.max(examLines.length, subjectLines.length, 1);
        const rowHeight = 7 + contentLines * 4 + remarksLines.length * 4;

        if (y + rowHeight > 275) {
            doc.addPage();
            drawBrandHeader(doc, data.tenantName, 'REPORT CARD');
            y = drawReportTableHeader(doc, 40);
        }

        doc.setFont('helvetica', 'normal');
        setPdfText(doc, PDF_COLOR.foreground);
        doc.text(examLines, 18, y + 5);
        doc.text(subjectLines, 64, y + 5);
        doc.setFont('helvetica', 'bold');
        doc.text(
            result.isAbsent
                ? 'Absent'
                : result.marksObtained === null
                    ? 'Not recorded'
                    : formatDecimalExact(result.marksObtained),
            124,
            y + 5,
        );
        doc.text(formatDecimalExact(result.maxMarks), 147, y + 5);
        doc.text(cleanText(result.grade ?? '-'), 168, y + 5);

        if (remarksLines.length > 0) {
            doc.setFont('helvetica', 'italic');
            setPdfText(doc, PDF_COLOR.mutedForeground);
            doc.text(remarksLines, 18, y + 7 + contentLines * 4);
        }

        y += rowHeight;
        setPdfDraw(doc, PDF_COLOR.border);
        doc.line(16, y, 194, y);
    }

    drawPageFooter(doc, 'Published academic results. Marks are reproduced from persisted records.');
    return doc.output('arraybuffer');
}
