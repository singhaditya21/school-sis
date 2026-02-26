import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getReceiptDetail } from '@/lib/actions/queries';

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const receipt = await getReceiptDetail(id);

    if (!receipt) {
        return <div className="p-8 text-center text-gray-500">Receipt not found.</div>;
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Receipt</h1>
                    <p className="text-gray-600">{receipt.receiptNumber}</p>
                </div>
                <Link href="/invoices" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-8 print:shadow-none">
                <div className="text-center mb-8">
                    <h2 className="text-xl font-bold">Payment Receipt</h2>
                    <p className="text-gray-500">{receipt.receiptNumber}</p>
                </div>

                <dl className="space-y-3 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">Student</dt><dd className="font-medium">{receipt.studentFirstName} {receipt.studentLastName}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Amount</dt><dd className="font-bold text-green-600">{formatCurrency(Number(receipt.amount))}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Method</dt><dd>{receipt.method}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Date</dt><dd>{formatDate(receipt.paymentDate)}</dd></div>
                </dl>

                <div className="mt-8 pt-4 border-t text-center">
                    <button onClick={() => window.print()} className="px-4 py-2 border rounded-lg hover:bg-gray-50 print:hidden">
                        🖨️ Print Receipt
                    </button>
                </div>
            </div>
        </div>
    );
}
