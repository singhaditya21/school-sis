import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getInvoiceDetail } from '@/lib/actions/queries';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const invoice = await getInvoiceDetail(id);

    if (!invoice) {
        return <div className="p-8 text-center text-gray-500">Invoice not found.</div>;
    }

    const dueAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{invoice.invoiceNumber}</h1>
                    <p className="text-gray-600">{invoice.studentName}</p>
                </div>
                <Link href="/invoices" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-2xl font-bold">{formatCurrency(Number(invoice.totalAmount))}</p>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-6">
                    <p className="text-sm text-green-600">Paid</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(Number(invoice.paidAmount))}</p>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                    <p className="text-sm text-red-600">Due</p>
                    <p className="text-2xl font-bold text-red-700">{formatCurrency(dueAmount)}</p>
                </div>
            </div>

            {dueAmount > 0 && (
                <div className="flex gap-3">
                    <Link href={`/invoices/${id}/record-payment`} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Record Payment</Link>
                    <Link href={`/invoices/${id}/apply-concession`} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Apply Concession</Link>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold mb-4">Fee Components</h2>
                <div className="divide-y">
                    {invoice.lineItems?.map((item, i) => (
                        <div key={i} className="flex justify-between py-2">
                            <span>{item.name} <span className="text-xs text-gray-400">({item.frequency})</span></span>
                            <span className="font-medium">{formatCurrency(Number(item.amount))}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold mb-4">Payment History</h2>
                {invoice.payments?.length > 0 ? (
                    <div className="divide-y">
                        {invoice.payments.map((p) => (
                            <div key={p.id} className="flex justify-between py-2">
                                <span>{formatDate(p.createdAt)} — {p.method}</span>
                                <span className="font-medium text-green-600">{formatCurrency(Number(p.amount))}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500">No payments yet.</p>
                )}
            </div>
        </div>
    );
}
