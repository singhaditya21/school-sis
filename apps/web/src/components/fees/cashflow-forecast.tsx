'use client';

/**
 * Cashflow Forecast Chart — Monthly projections visualization
 */

import { Badge } from '@/components/ui/badge';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceLine,
} from 'recharts';
import { TrendingUp, Calculator, Target } from 'lucide-react';
import type { CashflowForecast } from '@/lib/actions/cashflow';

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

// ─── Main Component ──────────────────────────────────────────

export default function CashflowForecastChart({ forecast }: { forecast: CashflowForecast }) {
    const chartData = forecast.months.map(m => ({
        month: m.label,
        expected: m.expectedInflow,
        projected: m.projectedCollection,
        invoices: m.invoiceCount,
    }));

    const summaryCards = [
        {
            label: 'Expected Inflow',
            value: formatCurrency(forecast.totalExpected),
            icon: Target,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50 dark:bg-blue-950/30',
            border: 'border-blue-200 dark:border-blue-900/50',
        },
        {
            label: 'Projected Collection',
            value: formatCurrency(forecast.totalProjected),
            icon: TrendingUp,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-950/30',
            border: 'border-green-200 dark:border-green-900/50',
        },
        {
            label: 'Historical Collection Rate',
            value: `${forecast.historicalCollectionRate}%`,
            icon: Calculator,
            color: 'text-purple-600 dark:text-purple-400',
            bg: 'bg-purple-50 dark:bg-purple-950/30',
            border: 'border-purple-200 dark:border-purple-900/50',
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Cashflow Forecast
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Next {forecast.months.length} months projection based on outstanding invoices
                    </p>
                </div>
                <Badge variant="outline" className="text-xs">
                    {forecast.historicalCollectionRate}% historical rate
                </Badge>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {summaryCards.map(card => (
                    <div
                        key={card.label}
                        className={`rounded-xl border ${card.border} ${card.bg} p-5 transition-all hover:shadow-md`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                            </div>
                            <card.icon className={`w-6 h-6 ${card.color}`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
                            <YAxis
                                tickFormatter={v =>
                                    v >= 100000 ? `${(v / 100000).toFixed(0)}L` :
                                        v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()
                                }
                                tickLine={false}
                                axisLine={false}
                                className="text-xs"
                            />
                            <Tooltip
                                formatter={(value: number) => [formatCurrency(value), '']}
                                contentStyle={{
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar dataKey="expected" name="Expected" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="projected" name="Projected" fill="#86efac" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Monthly Breakdown Table */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Month</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Invoices</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Expected</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Projected</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Gap</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {forecast.months.map(m => {
                            const gap = m.expectedInflow - m.projectedCollection;
                            return (
                                <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{m.label}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{m.invoiceCount}</td>
                                    <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-medium">
                                        {formatCurrency(m.expectedInflow)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">
                                        {formatCurrency(m.projectedCollection)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-red-500 dark:text-red-400">
                                        {gap > 0 ? `-${formatCurrency(gap)}` : '—'}
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
