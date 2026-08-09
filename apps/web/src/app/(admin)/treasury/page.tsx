import { getTreasurySummaryAction, getPaymentsLedgerAction, getTreasuryExceptionsAction } from '@/lib/actions/treasury';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatLegacyAmount(value: string | number | null | undefined): string {
    return Number(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default async function TreasuryDashboard() {
    const summary = await getTreasurySummaryAction();
    const dbLedger = await getPaymentsLedgerAction();
    const dbExceptions = await getTreasuryExceptionsAction();

    const exceptions = dbExceptions.map(e => ({
        id: e.id,
        transactionId: e.transactionId || e.id.slice(0, 8),
        paymentMethod: e.method,
        amount: formatLegacyAmount(e.amount),
        status: e.status || 'Status not recorded',
    }));

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900">Payment Orchestration</h1>
                    <p className="text-gray-500 mt-2 text-base">Read-only payment, receivable, and reconciliation records for this institution.</p>
                </div>
                <Badge variant="outline">Read-only</Badge>
            </div>

            <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Legacy payment and invoice records do not store a currency code. Amounts are shown without a currency symbol and must not be combined across currencies.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-2 border-emerald-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <CardHeader className="relative">
                        <CardDescription className="text-emerald-700 font-bold uppercase tracking-wider text-xs">Recorded Payment Amount</CardDescription>
                        <CardTitle className="text-4xl font-mono text-gray-900 mt-1">{formatLegacyAmount(summary.totalCollected)}</CardTitle>
                    </CardHeader>
                    <CardContent className="relative">
                        <p className="text-xs text-gray-500">All payment rows currently recorded for this institution.</p>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                    <CardHeader>
                        <CardDescription className="text-gray-500 font-bold uppercase tracking-wider text-xs">Outstanding Receivables</CardDescription>
                        <CardTitle className="text-4xl font-mono text-gray-900 mt-1">{formatLegacyAmount(summary.totalOutstanding)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Total amount on invoices currently marked pending.</p>
                    </CardContent>
                </Card>

                <Card className="border-2 border-red-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <CardHeader className="relative">
                        <CardDescription className="text-red-700 font-bold uppercase tracking-wider text-xs">Overdue Invoice Amount</CardDescription>
                        <CardTitle className="text-4xl font-mono text-gray-900 mt-1">{formatLegacyAmount(summary.totalOverdue)}</CardTitle>
                    </CardHeader>
                    <CardContent className="relative">
                        <p className="text-xs text-gray-500">Total amount on invoices currently marked overdue.</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-gray-200 shadow-sm bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Reconciliation Exceptions</CardTitle>
                        <CardDescription>Payments linked to student records that are missing an admission number.</CardDescription>
                    </div>
                    <Badge variant={exceptions.length > 0 ? 'destructive' : 'outline'}>{exceptions.length} open</Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Payment Method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Status / Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exceptions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No reconciliation exceptions are currently recorded.
                                        </td>
                                    </tr>
                                ) : exceptions.map((ex) => (
                                    <tr key={ex.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-gray-500 text-xs">{ex.transactionId}</td>
                                        <td className="px-6 py-4 font-semibold">{ex.paymentMethod}</td>
                                        <td className="px-6 py-4 font-mono">{ex.amount}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline">{ex.status}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-5">
                    <CardTitle className="text-xl">Payments Ledger</CardTitle>
                    <CardDescription>Recent payment records stored for this institution.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Invoice Number</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Paid At</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {dbLedger.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-4 text-center text-gray-500">No payment records found.</td>
                                    </tr>
                                ) : (
                                    dbLedger.map((row: { id: string; transactionId: string | null; invoiceNumber: string | null; method: string; amount: string | number; paidAt: string | Date; status: string }) => (
                                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs">{row.transactionId || row.id.slice(0, 8)}</td>
                                            <td className="px-6 py-4 font-semibold">{row.invoiceNumber || 'Not linked'}</td>
                                            <td className="px-6 py-4">{row.method}</td>
                                            <td className="px-6 py-4 font-mono">{formatLegacyAmount(row.amount)}</td>
                                            <td className="px-6 py-4 text-xs text-gray-500">{new Date(row.paidAt).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline">{row.status}</Badge>
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
