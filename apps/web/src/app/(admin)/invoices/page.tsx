import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getInvoices } from '@/lib/actions/fees';

export default async function InvoicesPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const invoices = await getInvoices({ limit: 50 });

    const statusColors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-700',
        PARTIAL: 'bg-blue-100 text-blue-700',
        PAID: 'bg-green-100 text-green-700',
        OVERDUE: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Invoices</h1>
                    <p className="text-gray-600 mt-1">{invoices.length} invoices</p>
                </div>
                <Link href="/invoices/generate" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Generate Invoices
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                        No invoices found.
                                    </td>
                                </tr>
                            ) : (
                                invoices.map((invoice) => {
                                    const dueAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount);
                                    return (
                                        <tr key={invoice.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                {invoice.invoiceNumber}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-blue-600 font-medium">{invoice.studentName}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {formatCurrency(Number(invoice.totalAmount))}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-green-600">
                                                {formatCurrency(Number(invoice.paidAmount))}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-red-600 font-medium">
                                                {formatCurrency(dueAmount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {formatDate(invoice.dueDate)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex gap-2">
                                                    <Link href={`/invoices/${invoice.id}`} className="text-blue-600 hover:underline text-sm">
                                                        View
                                                    </Link>
                                                    {invoice.status !== 'PAID' && (
                                                        <Link href={`/invoices/${invoice.id}/record-payment`} className="text-green-600 hover:underline text-sm">
                                                            Pay
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
