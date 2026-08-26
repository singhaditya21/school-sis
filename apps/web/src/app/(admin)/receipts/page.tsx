import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { getReceiptLedger } from './receipt-data';

export const metadata = {
    title: 'Payment Ledger | ScholarMind',
};

function statusClass(status: string): string {
    if (status === 'COMPLETED') return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'PENDING') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (status === 'REFUNDED') return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-red-50 text-red-700 border-red-200';
}

export default async function PaymentLedgerPage() {
    const ledger = await getReceiptLedger(100);
    const receiptedCount = ledger.filter((row) => row.receiptId !== null).length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment Ledger</h1>
                    <p className="text-gray-500 mt-1">
                        Immutable log of all cleared and pending treasury transactions.
                    </p>
                </div>
            </div>

            <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                    <CardTitle className="text-lg">
                        Recent Transactions
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            {receiptedCount} of {ledger.length} receipted
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-xs border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Student</th>
                                    <th className="px-6 py-4">Invoice Ref</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Receipt</th>
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
                                    ledger.map((row) => (
                                        <tr key={row.paymentId} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {formatDate(row.paidAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-gray-900">
                                                    {row.studentFirstName
                                                        ? `${row.studentFirstName} ${row.studentLastName ?? ''}`.trim()
                                                        : '—'}
                                                </span>
                                                {row.admissionNumber && (
                                                    <span className="block text-xs text-gray-500 font-mono">
                                                        {row.admissionNumber}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Link
                                                    href={`/invoices/${row.invoiceId}`}
                                                    className="font-semibold text-blue-600 hover:underline"
                                                >
                                                    {row.invoiceNumber ?? '—'}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant="outline" className="bg-gray-100">
                                                    {row.method}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-mono font-medium">
                                                {formatCurrency(Number(row.amount))}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant="outline" className={statusClass(row.status)}>
                                                    {row.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                {row.receiptId ? (
                                                    <Link
                                                        href={`/receipts/${row.receiptId}`}
                                                        className="text-blue-600 hover:underline text-sm font-medium"
                                                    >
                                                        {row.receiptNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">Not receipted</span>
                                                )}
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
