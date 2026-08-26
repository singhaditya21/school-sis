'use client';

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CalendarClock, Info, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { CashflowOutlook } from './cashflow-data';

/** Compact axis ticks — full values stay in the tooltip and the table. */
function compact(value: number): string {
    if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `${Math.round(value / 1000)}K`;
    return String(value);
}

function formatDay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function CashflowView({ outlook }: { outlook: CashflowOutlook }) {
    const { basis, backlog } = outlook;
    const hasFutureDues = outlook.totalOutstanding > 0;

    const chartData = outlook.months.map((m) => ({
        month: m.label,
        outstanding: m.outstanding,
        projected: m.projectedCollection ?? 0,
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cashflow Outlook</h1>
                <p className="text-muted-foreground mt-1">
                    Unpaid invoice balances for the next {outlook.horizonMonths} months, read from the fee
                    ledger on {formatDay(outlook.asOf)}.
                </p>
            </div>

            {/* Measured figures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                    Due in next {outlook.horizonMonths} months
                                </p>
                                <p className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">
                                    {formatCurrency(outlook.totalOutstanding)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Unpaid balance on issued invoices — measured, not estimated
                                </p>
                            </div>
                            <CalendarClock className="w-5 h-5 text-blue-500 shrink-0" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Already overdue</p>
                                <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                                    {formatCurrency(backlog.outstanding)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {backlog.invoiceCount} invoice{backlog.invoiceCount === 1 ? '' : 's'} past due
                                    {backlog.oldestDueDate ? `, oldest ${formatDay(backlog.oldestDueDate)}` : ''} —
                                    not counted in the outlook below
                                </p>
                            </div>
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                    Realised collection rate
                                </p>
                                {basis.measured ? (
                                    <>
                                        <p className="text-2xl font-bold mt-1 text-purple-600 dark:text-purple-400">
                                            {basis.ratePercent}%
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatCurrency(basis.maturedCollected)} collected of{' '}
                                            {formatCurrency(basis.maturedBilled)} billed across{' '}
                                            {basis.maturedInvoiceCount} matured invoices
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-2xl font-bold mt-1 text-muted-foreground">
                                            Not available
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {basis.maturedInvoiceCount} matured invoice
                                            {basis.maturedInvoiceCount === 1 ? '' : 's'} on record — at least{' '}
                                            {basis.minimumInvoices} are needed to measure a rate
                                        </p>
                                    </>
                                )}
                            </div>
                            <Wallet className="w-5 h-5 text-purple-500 shrink-0" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* How the projection is derived, or why there isn't one. With nothing
                falling due there is nothing to extrapolate, so the derivation note
                is only worth showing when a projection is actually on screen. */}
            {basis.measured ? (hasFutureDues && (
                <div className="rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/60 dark:bg-purple-950/20 p-4">
                    <div className="flex gap-3">
                        <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                        <div className="text-sm space-y-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                                Projected collection is an extrapolation, not a commitment.
                            </p>
                            <p className="text-muted-foreground">
                                It applies this school&apos;s own realised rate of{' '}
                                <strong>{basis.ratePercent}%</strong> to the outstanding balance in each month. That
                                rate is measured from {basis.maturedInvoiceCount} invoices due between{' '}
                                {basis.fromDueDate ? formatDay(basis.fromDueDate) : '—'} and{' '}
                                {basis.toDueDate ? formatDay(basis.toDueDate) : '—'}, counting only invoices that
                                have been due for at least {basis.graceDays} days. It assumes future months behave
                                like past ones, and nothing in the system enforces that.
                            </p>
                        </div>
                    </div>
                </div>
            )) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4">
                    <div className="flex gap-3">
                        <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="text-sm space-y-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                                Not enough billing history to project collections.
                            </p>
                            <p className="text-muted-foreground">
                                A projection would need a collection rate measured from this school&apos;s own
                                invoices — at least {basis.minimumInvoices} that have been due for{' '}
                                {basis.graceDays} days or more, within the last {basis.lookbackMonths} months. Only{' '}
                                {basis.maturedInvoiceCount} qualif
                                {basis.maturedInvoiceCount === 1 ? 'ies' : 'y'} so far, so no rate is assumed and no
                                projected figure is shown. The outstanding balances below are still exact.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-500" />
                                Balance falling due by month
                            </CardTitle>
                            <CardDescription>
                                {basis.measured && hasFutureDues
                                    ? 'Outstanding balance and the extrapolated share of it'
                                    : 'Outstanding balance only — no projection is being made'}
                            </CardDescription>
                        </div>
                        {basis.measured && hasFutureDues && (
                            <Badge variant="outline" className="text-xs shrink-0">
                                Projected at {basis.ratePercent}% (assumption)
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {hasFutureDues ? (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} barGap={4}>
                                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
                                    <YAxis
                                        tickFormatter={compact}
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                    />
                                    <Tooltip
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{
                                            backgroundColor: 'var(--background)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar
                                        dataKey="outstanding"
                                        name="Outstanding (measured)"
                                        fill="#93c5fd"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    {basis.measured && (
                                        <Bar
                                            dataKey="projected"
                                            name={`Projected at ${basis.ratePercent}% (assumption)`}
                                            fill="#86efac"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <CalendarClock className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                            <p className="font-medium text-gray-900 dark:text-white">
                                No invoices fall due in the next {outlook.horizonMonths} months.
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {backlog.outstanding > 0
                                    ? `There is ${formatCurrency(backlog.outstanding)} still outstanding from invoices that are already past due. Generate the next billing cycle to see a forward outlook.`
                                    : 'Generate the next billing cycle to see a forward outlook.'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Monthly breakdown */}
            <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-lg">Month by month</CardTitle>
                    <CardDescription>
                        Draft, cancelled and waived invoices are excluded throughout.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                        Month
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                                        Invoices
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                                        Outstanding
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                                        {basis.measured ? `Projected at ${basis.ratePercent}%` : 'Projected'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {outlook.months.map((m) => (
                                    <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                            {m.label}
                                        </td>
                                        <td className="px-4 py-3 text-right text-muted-foreground">
                                            {m.invoiceCount}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                                            {formatCurrency(m.outstanding)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                                            {m.projectedCollection === null
                                                ? <span className="text-muted-foreground font-normal">Not projected</span>
                                                : formatCurrency(m.projectedCollection)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800">
                                <tr>
                                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Total</td>
                                    <td className="px-4 py-3" />
                                    <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                        {formatCurrency(outlook.totalOutstanding)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                                        {outlook.totalProjected === null
                                            ? <span className="text-muted-foreground font-normal">Not projected</span>
                                            : formatCurrency(outlook.totalProjected)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
