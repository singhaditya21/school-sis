import { jsPDF } from 'jspdf';

interface ReportCardData {
    student: {
        name: string;
        admissionNumber: string;
        className: string;
        dateOfBirth: Date;
        rollNo?: number;
    };
    tenant: {
        name: string;
        address?: string;
        phone?: string;
    };
    term: {
        name: string;
        academicYear: string;
    };
    marks: {
        subjectName: string;
        subjectCode: string;
        marksObtained: number;
        maxMarks: number;
        grade: string;
    }[];
    coScholastic?: {
        area: string;
        grade: string;
    }[];
    hpc?: {
        height?: number;
        weight?: number;
        bmi?: number;
    };
    summary: {
        totalMarks: number;
        maxMarks: number;
        percentage: number;
        grade: string;
        rank?: number;
        attendance?: number;
    };
    remarks?: {
        teacher?: string;
        principal?: string;
    };
}

export function generateReportCardPDF(data: ReportCardData): Buffer {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 15;

    // Helper to center text
    const centerText = (text: string, fontSize: number) => {
        doc.setFontSize(fontSize);
        const textWidth = doc.getTextWidth(text);
        return (pageWidth - textWidth) / 2;
    };

    // Header background
    doc.setFillColor(124, 58, 237); // Purple (school identity color)
    doc.rect(0, 0, pageWidth, 40, 'F');

    // School Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(data.tenant.name, centerText(data.tenant.name, 20), y + 5);

    // Report Card Title
    y += 12;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('PROGRESS REPORT CARD', centerText('PROGRESS REPORT CARD', 14), y + 5);

    // Term Info
    y += 10;
    doc.setFontSize(10);
    const termText = `${data.term.name} - ${data.term.academicYear}`;
    doc.text(termText, centerText(termText, 10), y + 5);

    // Student Information Box
    y = 48;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 2, 2, 'FD');

    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Name: `, margin + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.student.name, margin + 20, y);

    doc.setFont('helvetica', 'bold');
    doc.text(`Class: `, pageWidth / 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.student.className, pageWidth / 2 + 15, y);

    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text(`Adm No: `, margin + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.student.admissionNumber, margin + 25, y);

    if (data.student.rollNo) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Roll No: `, pageWidth / 2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(data.student.rollNo.toString(), pageWidth / 2 + 20, y);
    }

    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text(`DOB: `, margin + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(data.student.dateOfBirth), margin + 17, y);

    // Scholastic Marks Table
    y += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(124, 58, 237);
    doc.text('SCHOLASTIC PERFORMANCE', margin, y);

    y += 5;
    const tableStartY = y;
    const colWidths = [70, 25, 25, 25, 25]; // Subject, Max, Obtained, %, Grade
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const startX = (pageWidth - tableWidth) / 2;

    // Table Header
    doc.setFillColor(124, 58, 237);
    doc.rect(startX, y, tableWidth, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');

    let x = startX + 3;
    doc.text('Subject', x, y + 5);
    x += colWidths[0];
    doc.text('Max', x, y + 5);
    x += colWidths[1];
    doc.text('Marks', x, y + 5);
    x += colWidths[2];
    doc.text('%', x, y + 5);
    x += colWidths[3];
    doc.text('Grade', x, y + 5);

    y += 8;

    // Table Rows
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    data.marks.forEach((mark, index) => {
        const isEven = index % 2 === 0;
        if (isEven) {
            doc.setFillColor(249, 250, 251);
            doc.rect(startX, y, tableWidth, 7, 'F');
        }

        x = startX + 3;
        doc.text(mark.subjectName, x, y + 5);
        x += colWidths[0];
        doc.text(mark.maxMarks.toString(), x, y + 5);
        x += colWidths[1];

        // Color code marks (red if below pass, green if above 80%)
        const percent = (mark.marksObtained / mark.maxMarks) * 100;
        if (percent < 33) {
            doc.setTextColor(220, 38, 38); // red
        } else if (percent >= 80) {
            doc.setTextColor(22, 163, 74); // green
        } else {
            doc.setTextColor(0, 0, 0);
        }
        doc.text(mark.marksObtained.toString(), x, y + 5);

        doc.setTextColor(0, 0, 0);
        x += colWidths[2];
        doc.text(percent.toFixed(1), x, y + 5);
        x += colWidths[3];
        doc.setFont('helvetica', 'bold');
        doc.text(mark.grade, x, y + 5);
        doc.setFont('helvetica', 'normal');

        y += 7;
    });

    // Total Row
    doc.setFillColor(124, 58, 237);
    doc.rect(startX, y, tableWidth, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    x = startX + 3;
    doc.text('TOTAL', x, y + 5);
    x += colWidths[0];
    doc.text(data.summary.maxMarks.toString(), x, y + 5);
    x += colWidths[1];
    doc.text(data.summary.totalMarks.toString(), x, y + 5);
    x += colWidths[2];
    doc.text(data.summary.percentage.toFixed(1), x, y + 5);
    x += colWidths[3];
    doc.text(data.summary.grade, x, y + 5);

    y += 15;

    // Co-Scholastic Section (if available)
    if (data.coScholastic && data.coScholastic.length > 0) {
        doc.setTextColor(124, 58, 237);
        doc.setFontSize(11);
        doc.text('CO-SCHOLASTIC AREAS', margin, y);
        y += 5;

        doc.setFillColor(249, 250, 251);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 2, 2, 'F');

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        let coY = y + 7;
        let coX = margin + 5;
        data.coScholastic.forEach((item, index) => {
            doc.text(`${item.area}: `, coX, coY);
            doc.setFont('helvetica', 'bold');
            doc.text(item.grade, coX + 35, coY);
            doc.setFont('helvetica', 'normal');

            if (index % 2 === 1) {
                coY += 7;
                coX = margin + 5;
            } else {
                coX = pageWidth / 2;
            }
        });

        y += 25;
    }

    // Result Summary Box
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(34, 197, 94);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, 'FD');

    y += 10;
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');

    const resultText = `Overall Grade: ${data.summary.grade} | Percentage: ${data.summary.percentage.toFixed(1)}%`;
    doc.text(resultText, centerText(resultText, 12), y);

    y += 8;
    doc.setFontSize(10);
    let infoText = '';
    if (data.summary.rank) {
        infoText += `Rank: ${data.summary.rank}`;
    }
    if (data.summary.attendance) {
        if (infoText) infoText += ' | ';
        infoText += `Attendance: ${data.summary.attendance.toFixed(1)}%`;
    }
    if (infoText) {
        doc.text(infoText, centerText(infoText, 10), y);
    }

    y += 15;

    // Remarks Section
    if (data.remarks) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);

        if (data.remarks.teacher) {
            doc.setFont('helvetica', 'bold');
            doc.text("Class Teacher's Remarks:", margin, y);
            doc.setFont('helvetica', 'normal');
            y += 5;
            doc.text(data.remarks.teacher, margin, y);
            y += 10;
        }

        if (data.remarks.principal) {
            doc.setFont('helvetica', 'bold');
            doc.text("Principal's Remarks:", margin, y);
            doc.setFont('helvetica', 'normal');
            y += 5;
            doc.text(data.remarks.principal, margin, y);
        }
    }

    // Footer
    y = 270;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, margin + 40, y);
    doc.line(pageWidth / 2 - 20, y, pageWidth / 2 + 20, y);
    doc.line(pageWidth - margin - 40, y, pageWidth - margin, y);

    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Class Teacher', margin + 10, y);
    doc.text("Parent's Signature", pageWidth / 2 - 15, y);
    doc.text('Principal', pageWidth - margin - 25, y);

    y += 10;
    doc.text(
        'This is a computer-generated report card.',
        centerText('This is a computer-generated report card.', 8),
        y
    );

    // Generate buffer
    const pdfOutput = doc.output('arraybuffer');
    return Buffer.from(pdfOutput);
}

function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export type { ReportCardData };
