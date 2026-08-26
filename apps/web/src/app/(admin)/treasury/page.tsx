import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { getTreasuryPageData } from './queries';

export const metadata = {
    title: 'Treasury | ScholarMind',
};

const METHOD_LABELS: Record<string, string> = {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK_TRANSFER: 'Bank transfer',
    CHEQUE: 'Cheque',
    CARD: 'Card',
    ONLINE: 'Online',
};

function methodLabel(method: string): string {
    return METHOD_LABELS[method] ?? method;
}

function formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatFyStart(fyStart: string): string {
    return new Date(`${fyStart}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default async function TreasuryDashboard() {
    const { scope, summary, fyStart, methodMix, paymentExceptions, ledgerMismatches, ledger } =
        await getTreasuryPageData();

    const campusLabel = scope?.campusName ?? 'this campus';
    const exceptionCount = paymentExceptions.length + ledgerMismatches.length;

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-6">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
                    Payment Orchestration
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Cash collected, receivables still open, and transactions that did not reconcile — read
                    straight from the fee ledger for {campusLabel}.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    {scope?.groupName ? (
                        <>
                            This campus is mapped to the <strong>{scope.groupName}</strong> group
                            {scope.region ? ` (${scope.region}` : ''}
                            {scope.region && scope.campusType ? `, ${scope.campusType.toLowerCase()}` : ''}
                            {scope.region ? ')' : ''}. Figures below still cover this campus only — a campus
                            session cannot read another campus&rsquo;s ledger, so no group total is shown.
                        </>
                    ) : (
                        <>
                            This campus is not mapped to a multi-campus group, so every figure below covers{' '}
                            {campusLabel} only. Consolidated group reporting is not available from a campus
                            login in this release.
                        </>
                    )}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardDescription className="font-semibold uppercase tracking-wider text-xs">
                            Total Collected (YTD)
                        </CardDescription>
                        <CardTitle className="text-4xl font-mono mt-1">
                            {formatCurrency(summary.collectedYtd)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {summary.collectedYtdCount} settled receipt
                            {summary.collectedYtdCount === 1 ? '' : 's'} since {formatFyStart(fyStart)}.
                            {summary.collectedAllTime !== summary.collectedYtd && (
                                <> All-time: {formatCurrency(summary.collectedAllTime)}.</>
                            )}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardDescription className="font-semibold uppercase tracking-wider text-xs">
                            Outstanding Receivables
                        </CardDescription>
                        <CardTitle className="text-4xl font-mono mt-1">
                            {formatCurrency(summary.outstanding)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Unpaid balance on {summary.outstandingCount} invoice
                            {summary.outstandingCount === 1 ? '' : 's'} that is still payable.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardDescription className="font-semibold uppercase tracking-wider text-xs">
                            High Risk Overdue
                        </CardDescription>
                        <CardTitle className="text-4xl font-mono mt-1">
                            {formatCurrency(summary.overdue)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'} past the due
                            date.{' '}
                            {summary.overdueCount > 0 && (
                                <Link href="/fees/defaulters" className="text-blue-600 dark:text-blue-400 hover:underline">
                                    Open defaulters
                                </Link>
                            )}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Collections by method</CardTitle>
                    <CardDescription>
                        Settled receipts since {formatFyStart(fyStart)}, grouped by how the money arrived.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {methodMix.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            No payments have been recorded this financial year.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {methodMix.map((row) => {
                                const share =
                                    summary.collectedYtd > 0
                                        ? Math.round((row.amount / summary.collectedYtd) * 100)
                                        : 0;
                                return (
                                    <div
                                        key={row.method}
                                        className="border border-gray-200 dark:border-gray-800 rounded-lg p-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">{methodLabel(row.method)}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{share}%</span>
                                        </div>
                                        <div className="text-xl font-mono mt-2">{formatCurrency(row.amount)}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {row.txnCount} receipt{row.txnCount === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-xl">Reconciliation Exceptions</CardTitle>
                        <CardDescription>
                            Payments that never reached a settled state. Every row is a real transaction on this
                            campus&rsquo;s ledger.
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className={exceptionCount > 0 ? 'text-red-700 bg-red-50 border-red-200' : ''}>
                        {exceptionCount} open
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="border-y border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Gateway / method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Invoice</th>
                                    <th className="px-6 py-4">Recorded</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {paymentExceptions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                            Every recorded payment is settled — nothing is pending, failed or
                                            refunded.
                                        </td>
                                    </tr>
                                ) : (
                                    paymentExceptions.map((ex) => (
                                        <tr key={ex.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {ex.transactionId || '—'}
                                            </td>
                                            <td className="px-6 py-4 font-semibold">{methodLabel(ex.method)}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(ex.amount)}</td>
                                            <td className="px-6 py-4">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        ex.status === 'FAILED'
                                                            ? 'text-red-600 bg-red-50 border-red-200'
                                                            : 'text-orange-600 bg-orange-50 border-orange-200'
                                                    }
                                                >
                                                    {ex.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                {ex.invoiceId ? (
                                                    <Link
                                                        href={`/invoices/${ex.invoiceId}`}
                                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {ex.invoiceNumber || 'View invoice'}
                                                    </Link>
                                                ) : (
                                                    <span className="text-gray-400">Unlinked</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(ex.paidAt)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Invoice ledger mismatches</CardTitle>
                    <CardDescription>
                        Invoices whose recorded paid amount disagrees with the sum of their settled payments.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="border-y border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Invoice</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Invoiced</th>
                                    <th className="px-6 py-4">Recorded paid</th>
                                    <th className="px-6 py-4">Settled receipts</th>
                                    <th className="px-6 py-4">Difference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {ledgerMismatches.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                            Invoice balances agree with the payment ledger.
                                        </td>
                                    </tr>
                                ) : (
                                    ledgerMismatches.map((row) => (
                                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                            <td className="px-6 py-4">
                                                <Link
                                                    href={`/invoices/${row.id}`}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                                                >
                                                    {row.invoiceNumber}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline">{row.status}</Badge>
                                            </td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(row.totalAmount)}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(row.paidAmount)}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(row.settled)}</td>
                                            <td className="px-6 py-4 font-mono text-red-600">
                                                {formatCurrency(row.paidAmount - row.settled)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Payments Ledger</CardTitle>
                    <CardDescription>The 50 most recent settled receipts for this campus.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="border-y border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Invoice</th>
                                    <th className="px-6 py-4">Student</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Reference</th>
                                    <th className="px-6 py-4">Paid on</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {ledger.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                            No settled payments have been recorded for this campus yet.
                                        </td>
                                    </tr>
                                ) : (
                                    ledger.map((row) => (
                                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                            <td className="px-6 py-4 font-semibold">
                                                {row.invoiceId ? (
                                                    <Link
                                                        href={`/invoices/${row.invoiceId}`}
                                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {row.invoiceNumber || 'View invoice'}
                                                    </Link>
                                                ) : (
                                                    <span className="text-gray-400">Unlinked</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">{row.studentName || '—'}</td>
                                            <td className="px-6 py-4">{methodLabel(row.method)}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(row.amount)}</td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {row.transactionId || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(row.paidAt)}
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
