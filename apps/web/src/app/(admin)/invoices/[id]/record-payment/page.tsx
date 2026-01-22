import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function RecordPaymentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    // Fetch invoice info
    let invoice = { invoiceNumber: '', dueAmount: 0 };

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/invoices/${id}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            invoice = data.data || invoice;
        }
    } catch (error) {
        console.error('[Payment] API Error:', error);
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Record Payment</h1>
                <Link href={`/invoices/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-600">Invoice: {invoice.invoiceNumber}</p>
                <p className="text-lg font-bold text-blue-800">Due: ₹{invoice.dueAmount?.toLocaleString()}</p>
            </div>

            <form action={`/api/payments`} method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <input type="hidden" name="invoiceId" value={id} />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input name="amount" type="number" required max={invoice.dueAmount} className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select name="paymentMethod" className="w-full px-3 py-2 border rounded-lg">
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="CARD">Card</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                    <input name="paymentDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea name="notes" rows={2} className="w-full px-3 py-2 border rounded-lg"></textarea>
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Record Payment
                </button>
            </form>
        </div>
    );
}
