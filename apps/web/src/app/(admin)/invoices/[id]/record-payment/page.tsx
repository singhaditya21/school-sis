import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { getInvoiceDetail } from '@/lib/actions/queries';

export default async function RecordPaymentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const invoice = await getInvoiceDetail(id);
    if (!invoice) return <div className="p-8 text-center text-gray-500">Invoice not found.</div>;

    const dueAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Record Payment</h1>
                    <p className="text-gray-600">{invoice.invoiceNumber} — {invoice.studentName}</p>
                </div>
                <Link href={`/invoices/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div><p className="text-sm text-gray-500">Total</p><p className="text-lg font-bold">{formatCurrency(Number(invoice.totalAmount))}</p></div>
                    <div><p className="text-sm text-gray-500">Balance Due</p><p className="text-lg font-bold text-red-600">{formatCurrency(dueAmount)}</p></div>
                </div>

                <form action="/api/payments" method="POST" className="space-y-4">
                    <input type="hidden" name="invoiceId" value={id} />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                        <input type="number" name="amount" step="0.01" max={dueAmount} defaultValue={dueAmount}
                            className="w-full px-3 py-2 border rounded-lg" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <select name="method" className="w-full px-3 py-2 border rounded-lg" required>
                            <option value="CASH">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="CARD">Card</option>
                            <option value="NET_BANKING">Net Banking</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="DD">Demand Draft</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                        <input type="text" name="reference" className="w-full px-3 py-2 border rounded-lg" placeholder="Transaction ID / Cheque No" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                        <textarea name="remarks" className="w-full px-3 py-2 border rounded-lg" rows={2} />
                    </div>

                    <button type="submit" className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Record Payment
                    </button>
                </form>
            </div>
        </div>
    );
}
