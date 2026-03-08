'use client';

/**
 * Defaulter Dashboard — Fee Intelligence Primary Wedge
 * 
 * Shows overdue invoice analytics: summary cards, ageing analysis,
 * and a student-wise defaulter list with sort/filter controls.
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    AlertTriangle,
    Users,
    Clock,
    TrendingUp,
    ArrowUpDown,
    IndianRupee,
    ChevronRight,
    FileText,
    Send,
} from 'lucide-react';
import type {
    DefaulterStats,
    AgeingBucket,
    DefaulterItem,
} from '@/lib/actions/fees';

// ─── Currency Formatter ──────────────────────────────────────

function formatCurrency(amount: number): string {
    if (amount >= 10000000) {
        return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
        return `₹${(amount / 100000).toFixed(2)} L`;
    }
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

// ─── Summary Cards ───────────────────────────────────────────

function SummaryCards({ stats }: { stats: DefaulterStats }) {
    const cards = [
        {
            label: 'Total Overdue',
            value: formatCurrency(stats.totalOverdueAmount),
            icon: IndianRupee,
            color: 'text-red-600 dark:text-red-400',
            bg: 'bg-red-50 dark:bg-red-950/30',
            border: 'border-red-200 dark:border-red-900/50',
        },
        {
            label: 'Defaulters',
            value: stats.defaulterCount.toString(),
            icon: Users,
            color: 'text-orange-600 dark:text-orange-400',
            bg: 'bg-orange-50 dark:bg-orange-950/30',
            border: 'border-orange-200 dark:border-orange-900/50',
        },
        {
            label: 'Avg Days Overdue',
            value: `${stats.averageDaysOverdue} days`,
            icon: Clock,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-950/30',
            border: 'border-amber-200 dark:border-amber-900/50',
        },
        {
            label: 'Highest Single Due',
            value: formatCurrency(stats.highestOverdue),
            icon: TrendingUp,
            color: 'text-rose-600 dark:text-rose-400',
            bg: 'bg-rose-50 dark:bg-rose-950/30',
            border: 'border-rose-200 dark:border-rose-900/50',
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
        { bar: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-300' },
        { bar: 'bg-orange-400', text: 'text-orange-700 dark:text-orange-300' },
        { bar: 'bg-red-400', text: 'text-red-700 dark:text-red-300' },
        { bar: 'bg-rose-600', text: 'text-rose-700 dark:text-rose-300' },
    ];

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
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
                                    <span className="font-semibold text-gray-900 dark:text-white w-28 text-right">
                                        {formatCurrency(bucket.amount)}
                                    </span>
                                </div>
                            </div>
                            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
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

function DefaulterTable({
    defaulters,
    sortBy,
    onSortChange,
}: {
    defaulters: DefaulterItem[];
    sortBy: 'amount' | 'days';
    onSortChange: (sort: 'amount' | 'days') => void;
}) {
    if (defaulters.length === 0) {
        return (
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-8 text-center">
                <div className="text-green-600 dark:text-green-400 text-lg font-medium">
                    🎉 No defaulters! All fees are up to date.
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
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
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
                            }`}
                    >
                        <ArrowUpDown className="w-3 h-3 inline mr-1" />
                        Amount
                    </button>
                    <button
                        onClick={() => onSortChange('days')}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${sortBy === 'days'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
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
                        <tr className="bg-gray-50 dark:bg-gray-900/50">
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
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {defaulters.map((d) => {
                            const urgency =
                                d.daysOverdue > 90
                                    ? 'bg-rose-50 dark:bg-rose-950/20'
                                    : d.daysOverdue > 60
                                        ? 'bg-red-50 dark:bg-red-950/20'
                                        : d.daysOverdue > 30
                                            ? 'bg-orange-50 dark:bg-orange-950/20'
                                            : '';

                            const urgencyBadge =
                                d.daysOverdue > 90
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                    : d.daysOverdue > 60
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                        : d.daysOverdue > 30
                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';

                            return (
                                <tr
                                    key={d.studentId}
                                    className={`${urgency} hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                                            {d.studentName}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {d.className}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(d.totalDue)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-green-600 dark:text-green-400">
                                        {formatCurrency(d.totalPaid)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600 dark:text-red-400">
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
                                            <button
                                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground hover:text-blue-600 transition-colors"
                                                title="View invoices"
                                            >
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            <button
                                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground hover:text-orange-600 transition-colors"
                                                title="Send reminder"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                            <button
                                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground hover:text-green-600 transition-colors"
                                                title="Record payment"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
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
}: {
    initialStats: DefaulterStats;
    initialAgeing: AgeingBucket[];
    initialDefaulters: DefaulterItem[];
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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
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
                    />
                </div>
            </div>
        </div>
    );
}
