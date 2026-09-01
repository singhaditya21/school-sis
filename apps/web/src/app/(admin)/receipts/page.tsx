import Link from 'next/link';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getReceiptLedger } from './receipt-data';

export const metadata = {
    title: 'Payment Ledger | ScholarMind',
};

/** The list is capped so the page stays bounded; the totals above it are not. */
const LEDGER_LIMIT = 100;

type LedgerTotals = {
    paymentCount: number;
    completedCount: number;
    completedAmount: string;
    completedReceiptedCount: number;
    pendingCount: number;
    pendingAmount: string;
    refundedCount: number;
    refundedAmount: string;
    failedCount: number;
    earliestPaidAt: Date | string | null;
    latestPaidAt: Date | string | null;
};

/**
 * Whole-tenant payment totals. The table below only renders the most recent
 * page of rows, so these are read separately rather than summed from what is
 * on screen — a total derived from a truncated list would be wrong.
 */
async function getLedgerTotals(tenantId: string): Promise<LedgerTotals> {
    const { rows } = await pool.query<LedgerTotals>(
        `SELECT
            COUNT(*)::int                                                     AS "paymentCount",
            COUNT(*) FILTER (WHERE p.status = 'COMPLETED')::int               AS "completedCount",
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'COMPLETED'), 0)  AS "completedAmount",
            COUNT(r.id) FILTER (WHERE p.status = 'COMPLETED')::int            AS "completedReceiptedCount",
            COUNT(*) FILTER (WHERE p.status = 'PENDING')::int                 AS "pendingCount",
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PENDING'), 0)    AS "pendingAmount",
            COUNT(*) FILTER (WHERE p.status = 'REFUNDED')::int                AS "refundedCount",
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'REFUNDED'), 0)   AS "refundedAmount",
            COUNT(*) FILTER (WHERE p.status = 'FAILED')::int                  AS "failedCount",
            MIN(p.paid_at)                                                    AS "earliestPaidAt",
            MAX(p.paid_at)                                                    AS "latestPaidAt"
         FROM payments p
         LEFT JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1`,
        [tenantId],
    );

    return rows[0];
}

function statusClass(status: string): string {
    if (status === 'COMPLETED') {
        return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50';
    }
    if (status === 'PENDING') {
        return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900/50';
    }
    if (status === 'REFUNDED') {
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50';
    }
    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50';
}

/**
 * A payment only earns a receipt once it has actually cleared. Saying why a row
 * has no receipt link is more useful than a bare "Not receipted".
 */
function noReceiptReason(status: string): string {
    if (status === 'PENDING') return 'Awaiting clearance';
    if (status === 'FAILED') return 'Payment failed';
    if (status === 'REFUNDED') return 'Refunded';
    return 'Not receipted';
}

export default async function PaymentLedgerPage() {
    // getReceiptLedger performs the session and fees:read check for this route.
    const ledger = await getReceiptLedger(LEDGER_LIMIT);
    const { tenantId } = await requireAuth();
    const totals = await getLedgerTotals(tenantId);

    const truncated = totals.paymentCount > ledger.length;
    const unreceipted = totals.completedCount - totals.completedReceiptedCount;

    const tiles = [
        {
            label: 'Cleared collections',
            value: formatCurrency(Number(totals.completedAmount)),
            note: `${totals.completedCount} completed payment${totals.completedCount === 1 ? '' : 's'}`,
        },
        {
            label: 'Awaiting clearance',
            value: formatCurrency(Number(totals.pendingAmount)),
            note: `${totals.pendingCount} pending${totals.failedCount > 0 ? ` · ${totals.failedCount} failed` : ''}`,
        },
        {
            label: 'Refunded',
            value: formatCurrency(Number(totals.refundedAmount)),
            note: `${totals.refundedCount} payment${totals.refundedCount === 1 ? '' : 's'} reversed`,
        },
        {
            label: 'Receipts issued',
            value: `${totals.completedReceiptedCount} / ${totals.completedCount}`,
            note:
                unreceipted > 0
                    ? `${unreceipted} cleared payment${unreceipted === 1 ? '' : 's'} without a receipt`
                    : 'Every cleared payment has a receipt',
        },
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
            <div className="border-b border-border dark:border-gray-800 pb-4">
                <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-white">
                    Payment Ledger
                </h1>
                <p className="text-muted-foreground mt-1">
                    Every payment recorded against this school&apos;s invoices, cleared or not, with the receipt
                    issued for it.
                    {totals.paymentCount > 0 && totals.earliestPaidAt && totals.latestPaidAt
                        ? ` Covering ${formatDate(totals.earliestPaidAt)} to ${formatDate(totals.latestPaidAt)}.`
                        : ''}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {tiles.map((tile) => (
                    <Card key={tile.label}>
                        <CardContent className="p-5">
                            <p className="text-sm font-medium text-muted-foreground">{tile.label}</p>
                            <p className="text-2xl font-bold mt-1 text-foreground dark:text-white">{tile.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{tile.note}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader className="border-b border-border dark:border-gray-800">
                    <CardTitle className="text-lg">
                        {truncated ? `Most recent ${ledger.length} payments` : 'All payments'}
                    </CardTitle>
                    <CardDescription>
                        {truncated
                            ? `${totals.paymentCount} payments in total — the ${ledger.length} most recent are listed here. Older entries are reachable from the invoice they settle.`
                            : `${totals.paymentCount} payment${totals.paymentCount === 1 ? '' : 's'} on record.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted dark:bg-gray-900/50 text-muted-foreground uppercase font-semibold text-xs border-b border-border dark:border-gray-800">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Student</th>
                                    <th className="px-6 py-4">Invoice ref</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Receipt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {ledger.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                                            No payments have been recorded yet. Entries appear here as invoices are
                                            settled.
                                        </td>
                                    </tr>
                                ) : (
                                    ledger.map((row) => (
                                        <tr
                                            key={row.paymentId}
                                            className="hover:bg-muted dark:hover:bg-gray-900/30 transition-colors"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                                {formatDate(row.paidAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-foreground dark:text-white">
                                                    {row.studentFirstName
                                                        ? `${row.studentFirstName} ${row.studentLastName ?? ''}`.trim()
                                                        : '—'}
                                                </span>
                                                {row.admissionNumber && (
                                                    <span className="block text-xs text-muted-foreground font-mono">
                                                        {row.admissionNumber}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Link
                                                    href={`/invoices/${row.invoiceId}`}
                                                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    {row.invoiceNumber ?? 'View invoice'}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant="outline">{row.method}</Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-medium text-foreground dark:text-white">
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
                                                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                                                    >
                                                        {row.receiptNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">
                                                        {noReceiptReason(row.status)}
                                                    </span>
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
