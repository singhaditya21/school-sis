'use client';

/**
 * Defaulter Dashboard — Fee Intelligence Primary Wedge
 * 
 * Shows overdue invoice analytics: summary cards, ageing analysis,
 * and a student-wise defaulter list with sort/filter controls.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    AlertTriangle,
    Users,
    Clock,
    TrendingUp,
    ArrowUpDown,
    IndianRupee,
    FileText,
    Send,
} from 'lucide-react';
import type {
    DefaulterStats,
    AgeingBucket,
    DefaulterItem,
} from '@/lib/actions/fees';
import { formatCompactCurrency as formatCurrency } from '@/lib/format';


// ─── Summary Cards ───────────────────────────────────────────

function SummaryCards({ stats }: { stats: DefaulterStats }) {
    const cards = [
        {
            label: 'Total Overdue',
            value: formatCurrency(stats.totalOverdueAmount),
            icon: IndianRupee,
            color: 'text-destructive',
            bg: 'bg-destructive-subtle/40',
            border: 'border-destructive/30',
        },
        {
            label: 'Defaulters',
            value: stats.defaulterCount.toString(),
            icon: Users,
            color: 'text-warning',
            bg: 'bg-warning-subtle/40',
            border: 'border-warning/30',
        },
        {
            label: 'Avg Days Overdue',
            value: `${stats.averageDaysOverdue} days`,
            icon: Clock,
            color: 'text-warning',
            bg: 'bg-warning-subtle/40',
            border: 'border-warning/30',
        },
        {
            label: 'Highest Single Due',
            value: formatCurrency(stats.highestOverdue),
            icon: TrendingUp,
            color: 'text-destructive',
            bg: 'bg-destructive-subtle/40',
            border: 'border-destructive/30',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className={`rounded-xl border ${card.border} ${card.bg} p-5 transition-all hover:shadow-md`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                        </div>
                        <div className={`p-3 rounded-lg ${card.bg}`}>
                            <card.icon className={`w-6 h-6 ${card.color}`} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Ageing Analysis ─────────────────────────────────────────

function AgeingAnalysis({ buckets }: { buckets: AgeingBucket[] }) {
    const totalAmount = buckets.reduce((sum, b) => sum + b.amount, 0);

    const ageingColors = [
        { bar: 'bg-warning/70', text: 'text-warning' },
        { bar: 'bg-warning', text: 'text-warning' },
        { bar: 'bg-destructive/80', text: 'text-destructive' },
        { bar: 'bg-destructive', text: 'text-destructive' },
    ];

    return (
        <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
                Ageing Analysis
            </h3>
            <div className="space-y-4">
                {buckets.map((bucket, idx) => {
                    const percentage = totalAmount > 0 ? (bucket.amount / totalAmount) * 100 : 0;
                    return (
                        <div key={bucket.label} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className={`font-medium ${ageingColors[idx].text}`}>
                                    {bucket.label}
                                </span>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="text-xs">
                                        {bucket.count} invoice{bucket.count !== 1 ? 's' : ''}
                                    </Badge>
                                    <span className="font-semibold text-foreground w-28 text-right">
                                        {formatCurrency(bucket.amount)}
                                    </span>
                                </div>
                            </div>
                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${ageingColors[idx].bar} rounded-full transition-all duration-500`}
                                    style={{ width: `${Math.max(percentage, 2)}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Defaulter List ──────────────────────────────────────────

/**
 * The invoice workspace matches students by name (`?q=`), so the student's own
 * name is the filter that scopes the list to just their invoices.
 */
function studentInvoicesHref(studentName: string): string {
    return `/invoices?q=${encodeURIComponent(studentName)}`;
}

function DefaulterTable({
    defaulters,
    sortBy,
    onSortChange,
    payableInvoiceIds,
}: {
    defaulters: DefaulterItem[];
    sortBy: 'amount' | 'days';
    onSortChange: (sort: 'amount' | 'days') => void;
    payableInvoiceIds: Record<string, string>;
}) {
    if (defaulters.length === 0) {
        return (
            <div className="rounded-xl border border-success/30 bg-success-subtle/40 p-8 text-center">
                <div className="text-success text-lg font-medium">
                    🎉 No defaulters! All fees are up to date.
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                    Defaulter List
                    <Badge variant="outline" className="ml-2 text-xs">
                        {defaulters.length} student{defaulters.length !== 1 ? 's' : ''}
                    </Badge>
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Sort by:</span>
                    <button
                        onClick={() => onSortChange('amount')}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${sortBy === 'amount'
                                ? 'bg-info-subtle text-info font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                            }`}
                    >
                        <ArrowUpDown className="w-3 h-3 inline mr-1" />
                        Amount
                    </button>
                    <button
                        onClick={() => onSortChange('days')}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${sortBy === 'days'
                                ? 'bg-info-subtle text-info font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                            }`}
                    >
                        <ArrowUpDown className="w-3 h-3 inline mr-1" />
                        Days Overdue
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-muted">
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Student
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Class
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Total Due
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Paid
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Balance
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Days Overdue
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Invoices
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {defaulters.map((d) => {
                            const urgency =
                                d.daysOverdue > 90
                                    ? 'bg-destructive-subtle/30'
                                    : d.daysOverdue > 60
                                        ? 'bg-destructive-subtle/20'
                                        : d.daysOverdue > 30
                                            ? 'bg-warning-subtle/20'
                                            : '';

                            const urgencyBadge =
                                d.daysOverdue > 90
                                    ? 'bg-destructive-subtle text-destructive'
                                    : d.daysOverdue > 60
                                        ? 'bg-destructive-subtle text-destructive'
                                        : d.daysOverdue > 30
                                            ? 'bg-warning-subtle text-warning'
                                            : 'bg-warning-subtle/60 text-warning';

                            return (
                                <tr
                                    key={d.studentId}
                                    className={`${urgency} hover:bg-muted transition-colors`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-foreground text-sm">
                                            {d.studentName}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {d.className}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                                        {formatCurrency(d.totalDue)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-success">
                                        {formatCurrency(d.totalPaid)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold text-destructive">
                                        {formatCurrency(d.balance)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Badge className={`text-xs ${urgencyBadge}`}>
                                            {d.daysOverdue}d
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                                        {d.invoiceCount}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Link
                                                href={studentInvoicesHref(d.studentName)}
                                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors inline-flex"
                                                title={`View all invoices for ${d.studentName}`}
                                                aria-label={`View all invoices for ${d.studentName}`}
                                            >
                                                <FileText className="w-4 h-4" />
                                            </Link>
                                            <button
                                                type="button"
                                                disabled
                                                className="p-1.5 rounded-lg text-muted-foreground opacity-40 cursor-not-allowed"
                                                title="Configure a live fee-reminder notification workflow first."
                                                aria-label="Send reminder — not available"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                            {payableInvoiceIds[d.studentId] ? (
                                                <Link
                                                    href={`/invoices/${payableInvoiceIds[d.studentId]}`}
                                                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-success transition-colors inline-flex"
                                                    title={`Record a payment against ${d.studentName}'s oldest overdue invoice`}
                                                    aria-label={`Record a payment for ${d.studentName}`}
                                                >
                                                    <IndianRupee className="w-4 h-4" />
                                                </Link>
                                            ) : (
                                                <Link
                                                    href={studentInvoicesHref(d.studentName)}
                                                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-success transition-colors inline-flex"
                                                    title={`Pick an invoice for ${d.studentName} to record a payment`}
                                                    aria-label={`Record a payment for ${d.studentName}`}
                                                >
                                                    <IndianRupee className="w-4 h-4" />
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────

export default function DefaulterDashboard({
    initialStats,
    initialAgeing,
    initialDefaulters,
    payableInvoiceIds,
}: {
    initialStats: DefaulterStats;
    initialAgeing: AgeingBucket[];
    initialDefaulters: DefaulterItem[];
    /** studentId → id of the oldest still-payable overdue invoice for that student. */
    payableInvoiceIds: Record<string, string>;
}) {
    const [sortBy, setSortBy] = useState<'amount' | 'days'>('amount');
    const [defaulters, setDefaulters] = useState(initialDefaulters);

    // Re-sort when sort changes (client-side for responsiveness)
    useEffect(() => {
        const sorted = [...initialDefaulters];
        if (sortBy === 'amount') {
            sorted.sort((a, b) => b.balance - a.balance);
        } else {
            sorted.sort((a, b) => b.daysOverdue - a.daysOverdue);
        }
        setDefaulters(sorted);
    }, [sortBy, initialDefaulters]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Fee Defaulter Dashboard
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {initialStats.overdueInvoiceCount} overdue invoice{initialStats.overdueInvoiceCount !== 1 ? 's' : ''} across {initialStats.defaulterCount} student{initialStats.defaulterCount !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            <Separator />

            {/* Summary Cards */}
            <SummaryCards stats={initialStats} />

            {/* Ageing + Top Defaulters side-by-side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                    <AgeingAnalysis buckets={initialAgeing} />
                </div>
                <div className="lg:col-span-2">
                    <DefaulterTable
                        defaulters={defaulters}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        payableInvoiceIds={payableInvoiceIds}
                    />
                </div>
            </div>
        </div>
    );
}
