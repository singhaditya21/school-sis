import { jsPDF } from 'jspdf';

interface ReceiptData {
    receiptNo: string;
    issuedAt: Date;
    tenant: {
        name: string;
        address?: string;
        phone?: string;
    };
    student: {
        name: string;
        admissionNumber: string;
        className: string;
    };
    payment: {
        amount: number;
        method: string;
        paidAt: Date;
        gatewayRef?: string;
    };
    invoice: {
        invoiceNo: string;
        feePlanName: string;
    };
}

export function generateReceiptPDF(data: ReceiptData): Buffer {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Helper to center text
    const centerText = (text: string, fontSize: number) => {
        doc.setFontSize(fontSize);
        const textWidth = doc.getTextWidth(text);
        return (pageWidth - textWidth) / 2;
    };

    // Header background
    doc.setFillColor(59, 130, 246); // Blue
    doc.rect(0, 0, pageWidth, 45, 'F');

    // School Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(data.tenant.name, centerText(data.tenant.name, 22), y + 5);

    // Receipt Title
    y += 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('FEE RECEIPT', centerText('FEE RECEIPT', 14), y + 5);

    // Receipt Number
    y = 55;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Receipt No: ${data.receiptNo}`, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${formatDate(data.issuedAt)}`, pageWidth - margin - 50, y);

    // Divider
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);

    // Student Information Section
    y += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STUDENT INFORMATION', margin, y);

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${data.student.name}`, margin, y);

    y += 7;
    doc.text(`Admission No: ${data.student.admissionNumber}`, margin, y);

    y += 7;
    doc.text(`Class: ${data.student.className}`, margin, y);

    // Divider
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);

    // Payment Details Section
    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENT DETAILS', margin, y);

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice No: ${data.invoice.invoiceNo}`, margin, y);

    y += 7;
    doc.text(`Fee Plan: ${data.invoice.feePlanName}`, margin, y);

    y += 7;
    doc.text(`Payment Method: ${data.payment.method.replace('_', ' ')}`, margin, y);

    y += 7;
    doc.text(`Payment Date: ${formatDate(data.payment.paidAt)}`, margin, y);

    if (data.payment.gatewayRef) {
        y += 7;
        doc.text(`Transaction ID: ${data.payment.gatewayRef}`, margin, y);
    }

    // Divider
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);

    // Amount Box
    y += 15;
    doc.setFillColor(240, 253, 244); // Light green
    doc.setDrawColor(34, 197, 94); // Green border
    doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 3, 3, 'FD');

    y += 12;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Paid:', margin + 10, y);

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    const amountText = formatCurrency(data.payment.amount);
    doc.text(amountText, pageWidth - margin - 10 - doc.getTextWidth(amountText), y + 5);

    // Footer
    y = 250;
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your payment!', centerText('Thank you for your payment!', 9), y);

    y += 6;
    doc.text(
        'This is a computer-generated receipt and does not require a signature.',
        centerText('This is a computer-generated receipt and does not require a signature.', 9),
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

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}
