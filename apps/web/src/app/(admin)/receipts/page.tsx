import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getPaymentsLedgerAction } from '@/lib/actions/treasury';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const metadata = {
    title: 'Payment Ledger | ScholarMind',
};

export default async function PaymentLedgerPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const ledger = await getPaymentsLedgerAction(100);

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment Ledger</h1>
                    <p className="text-gray-500 mt-1">Immutable log of all cleared and pending treasury transactions.</p>
                </div>
            </div>

            <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                    <CardTitle className="text-lg">Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-xs border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Invoice Ref</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {ledger.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                            No transactions recorded yet.
                                        </td>
                                    </tr>
                                ) : (
                                    ledger.map((payment) => (
                                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {formatDate(payment.paidAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold text-gray-500">
                                                {payment.transactionId || 'MANUAL-ENTRY'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="font-semibold text-blue-600">{payment.invoiceNumber}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant="outline" className="bg-gray-100">{payment.method}</Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-mono font-medium">
                                                {formatCurrency(Number(payment.amount))}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge 
                                                    variant="outline" 
                                                    className={
                                                        payment.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        payment.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                        'bg-red-50 text-red-700 border-red-200'
                                                    }
                                                >
                                                    {payment.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <Link href={`/receipts/${payment.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                                                    View Receipt
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
