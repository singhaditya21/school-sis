import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { getInvoiceDetail } from '@/lib/actions/queries';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const invoice = await getInvoiceDetail(id);
    if (!invoice) return <div className="p-8 text-center text-gray-500">Invoice not found.</div>;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Edit Invoice</h1>
                    <p className="text-gray-600">{invoice.invoiceNumber} — {invoice.studentName}</p>
                </div>
                <Link href={`/invoices/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <form action="/api/invoices/update" method="POST" className="space-y-4">
                    <input type="hidden" name="invoiceId" value={id} />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input type="date" name="dueDate" defaultValue={invoice.dueDate} className="w-full px-3 py-2 border rounded-lg" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea name="description" defaultValue={invoice.description || ''} className="w-full px-3 py-2 border rounded-lg" rows={3} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select name="status" defaultValue={invoice.status} className="w-full px-3 py-2 border rounded-lg">
                            <option value="PENDING">Pending</option>
                            <option value="PARTIAL">Partial</option>
                            <option value="PAID">Paid</option>
                            <option value="OVERDUE">Overdue</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>

                    <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Update Invoice
                    </button>
                </form>
            </div>
        </div>
    );
}
