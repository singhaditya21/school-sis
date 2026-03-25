/**
 * PDF Report Generation Service
 *
 * Generates fee receipts, mark sheets, and transfer certificates
 * as production-quality PDFs using HTML-to-PDF conversion.
 *
 * Uses native HTML rendering for cross-platform compatibility.
 */

import { db, setTenantContext } from '@/lib/db';
import { tenants, students, invoices, payments } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ReceiptData {
    schoolName: string;
    schoolAddress: string;
    schoolLogo?: string;
    receiptNumber: string;
    studentName: string;
    admissionNumber: string;
    grade: string;
    section: string;
    invoiceNumber: string;
    items: { description: string; amount: number }[];
    totalAmount: number;
    paidAmount: number;
    paymentMethod: string;
    paidAt: string;
    generatedAt: string;
}

/**
 * Generate a fee receipt HTML for PDF conversion.
 */
export function generateReceiptHTML(data: ReceiptData): string {
    const itemRows = data.items.map(item => `
        <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0;">${item.description}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${item.amount.toLocaleString('en-IN')}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, sans-serif; color: #1e293b; background: #fff; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 24px; margin-bottom: 32px; }
        .school-name { font-size: 24px; font-weight: 700; color: #0f172a; }
        .school-address { font-size: 12px; color: #64748b; margin-top: 4px; }
        .receipt-badge { background: #0f172a; color: #fff; padding: 8px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
        .info-block label { display: block; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
        .info-block .value { font-size: 14px; font-weight: 600; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        thead th { background: #f1f5f9; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #0f172a; padding-top: 12px; }
        .footer { margin-top: 48px; display: flex; justify-content: space-between; align-items: flex-end; }
        .stamp { text-align: center; }
        .stamp-line { width: 200px; border-top: 1px solid #94a3b8; margin-top: 60px; padding-top: 8px; font-size: 12px; color: #64748b; }
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; color: rgba(0,0,0,0.03); font-weight: 900; }
    </style>
</head>
<body>
    <div class="watermark">PAID</div>
    <div class="header">
        <div>
            <div class="school-name">${data.schoolName}</div>
            <div class="school-address">${data.schoolAddress}</div>
        </div>
        <div class="receipt-badge">Receipt #${data.receiptNumber}</div>
    </div>

    <div class="info-grid">
        <div class="info-block">
            <label>Student Name</label>
            <div class="value">${data.studentName}</div>
        </div>
        <div class="info-block">
            <label>Admission No.</label>
            <div class="value">${data.admissionNumber}</div>
        </div>
        <div class="info-block">
            <label>Class</label>
            <div class="value">${data.grade} - ${data.section}</div>
        </div>
        <div class="info-block">
            <label>Invoice</label>
            <div class="value">#${data.invoiceNumber}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
            <tr class="total-row">
                <td style="padding: 12px 16px;">Total</td>
                <td style="padding: 12px 16px; text-align: right;">₹${data.totalAmount.toLocaleString('en-IN')}</td>
            </tr>
        </tbody>
    </table>

    <div class="info-grid">
        <div class="info-block">
            <label>Payment Method</label>
            <div class="value">${data.paymentMethod}</div>
        </div>
        <div class="info-block">
            <label>Paid On</label>
            <div class="value">${data.paidAt}</div>
        </div>
    </div>

    <div class="footer">
        <div style="font-size: 11px; color: #94a3b8;">Generated: ${data.generatedAt}</div>
        <div class="stamp">
            <div class="stamp-line">Authorized Signatory</div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate a mark sheet / report card HTML.
 */
export function generateMarkSheetHTML(data: {
    schoolName: string;
    studentName: string;
    admissionNumber: string;
    grade: string;
    section: string;
    examName: string;
    subjects: { name: string; maxMarks: number; obtained: number; grade: string }[];
    totalMarks: number;
    totalObtained: number;
    percentage: number;
    rank?: number;
    remarks?: string;
}): string {
    const subjectRows = data.subjects.map(s => `
        <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0;">${s.name}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; text-align: center;">${s.maxMarks}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${s.obtained}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; text-align: center;">${s.grade}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, sans-serif; color: #1e293b; padding: 40px; }
        .header { text-align: center; border-bottom: 3px solid #0f172a; padding-bottom: 24px; margin-bottom: 32px; }
        .school-name { font-size: 28px; font-weight: 700; color: #0f172a; }
        .exam-title { font-size: 18px; color: #475569; margin-top: 8px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 32px; background: #f8fafc; padding: 20px; border-radius: 8px; }
        .info-block label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
        .info-block .value { font-size: 14px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
        thead th { background: #0f172a; color: #fff; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; }
        .summary { display: flex; justify-content: space-around; background: #f1f5f9; padding: 24px; border-radius: 8px; margin-bottom: 32px; }
        .summary-item { text-align: center; }
        .summary-item .number { font-size: 28px; font-weight: 700; color: #0f172a; }
        .summary-item .label { font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="header">
        <div class="school-name">${data.schoolName}</div>
        <div class="exam-title">${data.examName} — Report Card</div>
    </div>

    <div class="info-grid">
        <div class="info-block"><label>Student</label><div class="value">${data.studentName}</div></div>
        <div class="info-block"><label>Admission No.</label><div class="value">${data.admissionNumber}</div></div>
        <div class="info-block"><label>Class</label><div class="value">${data.grade} - ${data.section}</div></div>
    </div>

    <table>
        <thead>
            <tr><th>Subject</th><th style="text-align:center;">Max Marks</th><th style="text-align:center;">Obtained</th><th style="text-align:center;">Grade</th></tr>
        </thead>
        <tbody>${subjectRows}</tbody>
    </table>

    <div class="summary">
        <div class="summary-item"><div class="number">${data.totalObtained}/${data.totalMarks}</div><div class="label">Total Marks</div></div>
        <div class="summary-item"><div class="number">${data.percentage}%</div><div class="label">Percentage</div></div>
        ${data.rank ? `<div class="summary-item"><div class="number">#${data.rank}</div><div class="label">Class Rank</div></div>` : ''}
    </div>

    ${data.remarks ? `<div style="margin-top: 24px; padding: 16px; background: #fefce8; border-left: 4px solid #eab308; border-radius: 0 8px 8px 0;"><strong>Remarks:</strong> ${data.remarks}</div>` : ''}

    <div style="margin-top: 64px; display: flex; justify-content: space-between;">
        <div style="text-align: center;"><div style="width: 180px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; color: #64748b;">Class Teacher</div></div>
        <div style="text-align: center;"><div style="width: 180px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; color: #64748b;">Principal</div></div>
    </div>
</body>
</html>`;
}

/**
 * Generate a Transfer Certificate HTML.
 */
export function generateTransferCertificateHTML(data: {
    schoolName: string;
    schoolAddress: string;
    udiseCode: string;
    affiliationBoard: string;
    affiliationNumber: string;
    tcNumber: string;
    studentName: string;
    fatherName: string;
    motherName: string;
    dateOfBirth: string;
    admissionNumber: string;
    dateOfAdmission: string;
    classAtAdmission: string;
    classAtLeaving: string;
    dateOfLeaving: string;
    reason: string;
    conduct: string;
    remarks: string;
}): string {
    const fields = [
        ['TC Number', data.tcNumber],
        ['Name of Pupil', data.studentName],
        ["Father's Name", data.fatherName],
        ["Mother's Name", data.motherName],
        ['Date of Birth', data.dateOfBirth],
        ['Admission Number', data.admissionNumber],
        ['Date of Admission', data.dateOfAdmission],
        ['Class at Admission', data.classAtAdmission],
        ['Class at Leaving', data.classAtLeaving],
        ['Date of Leaving', data.dateOfLeaving],
        ['Reason for Leaving', data.reason],
        ['General Conduct', data.conduct],
        ['Remarks', data.remarks],
    ];

    const fieldRows = fields.map(([label, value]) => `
        <tr>
            <td style="padding: 10px 16px; border: 1px solid #cbd5e1; font-weight: 500; width: 40%; background: #f8fafc;">${label}</td>
            <td style="padding: 10px 16px; border: 1px solid #cbd5e1;">${value}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, sans-serif; color: #1e293b; padding: 40px; }
        .header { text-align: center; margin-bottom: 32px; border-bottom: 3px double #0f172a; padding-bottom: 24px; }
        .school-name { font-size: 26px; font-weight: 700; }
        .school-meta { font-size: 12px; color: #64748b; margin-top: 4px; }
        .tc-title { font-size: 20px; font-weight: 600; margin-top: 16px; text-decoration: underline; }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    </style>
</head>
<body>
    <div class="header">
        <div class="school-name">${data.schoolName}</div>
        <div class="school-meta">${data.schoolAddress}</div>
        <div class="school-meta">UDISE: ${data.udiseCode} | ${data.affiliationBoard} Affiliation: ${data.affiliationNumber}</div>
        <div class="tc-title">TRANSFER CERTIFICATE</div>
    </div>

    <table>${fieldRows}</table>

    <div style="margin-top: 64px; display: flex; justify-content: space-between;">
        <div style="text-align: center;"><div style="width: 180px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; color: #64748b;">Class Teacher</div></div>
        <div style="text-align: center;"><div style="width: 180px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; color: #64748b;">Principal</div></div>
        <div style="text-align: center;"><div style="width: 120px; border: 2px solid #cbd5e1; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8;">School Seal</div></div>
    </div>
</body>
</html>`;
}
