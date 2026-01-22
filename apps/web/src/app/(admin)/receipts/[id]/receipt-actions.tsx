'use client';

import Link from 'next/link';

interface ReceiptActionsProps {
    receiptId: string;
    invoiceId: string;
}

export function ReceiptActions({ receiptId, invoiceId }: ReceiptActionsProps) {
    return (
        <div className="mt-6 flex justify-center gap-4 print:hidden">
            <a
                href={`/api/receipts/${receiptId}/pdf`}
                download
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
                📄 Download PDF
            </a>
            <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
                🖨️ Print Receipt
            </button>
            <Link
                href={`/invoices/${invoiceId}`}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
                View Invoice
            </Link>
        </div>
    );
}
