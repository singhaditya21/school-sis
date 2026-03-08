'use client';

/**
 * Fee Overview Cards + Collection Trend Chart
 * 
 * Shows the high-level fee analytics: total billed, collected, pending,
 * collection rate, and a 6-month collection vs billing trend chart.
 */

import { Badge } from '@/components/ui/badge';
import {
    IndianRupee,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    BarChart3,
    FileText,
} from 'lucide-react';
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
import type { FeeOverview, CollectionTrendItem } from '@/lib/actions/fees';

// ─── Currency Formatter ──────────────────────────────────────

function formatCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

// ─── Overview Cards ──────────────────────────────────────────

export function FeeOverviewCards({ overview }: { overview: FeeOverview }) {
    const cards = [
        {
            label: 'Total Billed',
            value: formatCurrency(overview.totalBilled),
            sub: `${overview.invoiceCount} invoices`,
            icon: FileText,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50 dark:bg-blue-950/30',
            border: 'border-blue-200 dark:border-blue-900/50',
        },
        {
            label: 'Collected',
            value: formatCurrency(overview.totalCollected),
            sub: `${overview.paidInvoiceCount} paid`,
            icon: CheckCircle,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-950/30',
            border: 'border-green-200 dark:border-green-900/50',
        },
        {
            label: 'Pending',
            value: formatCurrency(overview.totalPending),
            sub: `${overview.collectionRate}% collected`,
            icon: TrendingUp,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-950/30',
            border: 'border-amber-200 dark:border-amber-900/50',
        },
        {
            label: 'Defaulters',
            value: overview.defaulterCount.toString(),
            sub: formatCurrency(overview.overdueAmount) + ' overdue',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bg: 'bg-red-50 dark:bg-red-950/30',
            border: 'border-red-200 dark:border-red-900/50',
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
                            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
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

// ─── Collection Rate Bar ─────────────────────────────────────

export function CollectionRateBar({ rate }: { rate: number }) {
    const color =
        rate >= 90
            ? 'bg-green-500'
            : rate >= 70
                ? 'bg-amber-500'
                : rate >= 50
                    ? 'bg-orange-500'
                    : 'bg-red-500';

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Collection Rate
                </h3>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {rate}%
                </span>
            </div>
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                    className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
                    style={{ width: `${rate}%` }}
                />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>0%</span>
                <span>Target: 90%</span>
                <span>100%</span>
            </div>
        </div>
    );
}

// ─── Collection Trend Chart ──────────────────────────────────

export function CollectionTrendChart({ data }: { data: CollectionTrendItem[] }) {
    // Custom tooltip formatter
    const tooltipFormatter = (value: number) => {
        return [formatCurrency(value), ''];
    };

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Collection Trend
                </h3>
                <Badge variant="outline" className="text-xs">
                    Last 6 months
                </Badge>
            </div>

            <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            className="text-xs"
                        />
                        <YAxis
                            tickFormatter={(v) =>
                                v >= 100000
                                    ? `${(v / 100000).toFixed(0)}L`
                                    : v >= 1000
                                        ? `${(v / 1000).toFixed(0)}K`
                                        : v.toString()
                            }
                            tickLine={false}
                            axisLine={false}
                            className="text-xs"
                        />
                        <Tooltip
                            formatter={tooltipFormatter}
                            contentStyle={{
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px',
                            }}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: '12px' }}
                        />
                        <Bar
                            dataKey="billed"
                            name="Billed"
                            fill="#93c5fd"
                            radius={[4, 4, 0, 0]}
                        />
                        <Bar
                            dataKey="collected"
                            name="Collected"
                            fill="#4ade80"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
