import { getSession } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

interface Receipt {
    id: string;
    receiptNumber: string;
    invoiceNumber: string;
    studentName: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
}

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    let receipt: Receipt | null = null;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/receipts/${id}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            receipt = data.data;
        }
    } catch (error) {
        console.error('[Receipt] API Error:', error);
    }

    if (!receipt) {
        return <div className="p-8 text-center text-gray-500">Receipt not found.</div>;
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Receipt</h1>
                <Link href="/invoices" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="text-center mb-6">
                    <p className="text-green-600 text-4xl mb-2">✓</p>
                    <h2 className="text-xl font-bold">Payment Received</h2>
                    <p className="text-3xl font-bold text-green-600 mt-2">{formatCurrency(receipt.amount)}</p>
                </div>

                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-gray-500">Receipt #</dt>
                        <dd className="font-medium">{receipt.receiptNumber}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-gray-500">Invoice</dt>
                        <dd>{receipt.invoiceNumber}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-gray-500">Student</dt>
                        <dd>{receipt.studentName}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-gray-500">Method</dt>
                        <dd>{receipt.paymentMethod}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-gray-500">Date</dt>
                        <dd>{receipt.paymentDate}</dd>
                    </div>
                </dl>

                <div className="mt-6 pt-6 border-t">
                    <a
                        href={`/api/receipts/${id}/pdf`}
                        target="_blank"
                        className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Download PDF
                    </a>
                </div>
            </div>
        </div>
    );
}
