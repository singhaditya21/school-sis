'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CircleSlash2, Landmark, Clock, ArrowUpRight } from 'lucide-react';

const COLORS = [
    'var(--sm-color-chart1)',
    'var(--sm-color-chart2)',
    'var(--sm-color-chart3)',
    'var(--sm-color-chart4)',
    'var(--sm-color-chart5)',
];

type CurrencyAmount = {
    currency: string;
    total_volume: string;
};

type MethodAggregate = CurrencyAmount & {
    payment_method: string | null;
    txn_count: number;
};

type NodeAggregate = CurrencyAmount & {
    node_name: string;
    txn_count: number;
};

function groupIndianDigits(value: string): string {
    if (value.length <= 3) return value;

    const finalThree = value.slice(-3);
    const leading = value.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${leading},${finalThree}`;
}

function formatRecordedAmount(value: string | null | undefined): string {
    const match = (value || '0').trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) return 'Unavailable';

    const sign = match[1] || '';
    const integer = (match[2] || '0').replace(/^0+(?=\d)/, '');
    const fraction = (match[3] || '').padEnd(2, '0');
    return `${sign}${groupIndianDigits(integer)}.${fraction}`;
}

function currencyLabel(currency: string): string {
    return currency === 'UNSPECIFIED' ? 'Currency unspecified' : currency;
}

export default function TreasuryClient({
    methodData,
    nodeData,
    kpis,
}: {
    methodData: MethodAggregate[];
    nodeData: NodeAggregate[];
    kpis: { completed: CurrencyAmount[]; pending: CurrencyAmount[] };
}) {

    // Charts intentionally use transaction counts. Monetary values remain
    // decimal strings and are never coerced through binary floating point.
    const pieData = methodData.map(m => ({
        name: `${m.payment_method || 'UNKNOWN'} · ${currencyLabel(m.currency)}`,
        value: m.txn_count,
    }));

    const barData = nodeData.map(n => ({
        name: `${n.node_name} · ${currencyLabel(n.currency)}`,
        transactions: n.txn_count,
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Treasury Overview</h1>
                <p className="text-sm text-muted-foreground mt-1">Read-only payment records across institutions.</p>
            </div>

            <div role="note" className="rounded-xl border border-warning bg-warning-muted px-4 py-3 text-sm text-warning">
                Amounts are grouped by their stored currency. Legacy rows without a currency are labelled “Currency unspecified” and are never combined with labelled currencies.
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border border-border p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Completed Recorded Amount</p>
                            {kpis.completed.length === 0 ? (
                                <p className="text-lg font-semibold text-foreground">No completed records</p>
                            ) : kpis.completed.map((amount) => (
                                <div key={amount.currency} className="mt-2">
                                    <p className="text-3xl font-bold text-success">{formatRecordedAmount(amount.total_volume)}</p>
                                    <p className="text-xs text-muted-foreground">{currencyLabel(amount.currency)}</p>
                                </div>
                            ))}
                        </div>
                        <Landmark className="w-5 h-5 text-success" />
                    </div>
                </div>
                <div className="bg-card border border-border p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Pending / Processing Amount</p>
                            {kpis.pending.length === 0 ? (
                                <p className="text-lg font-semibold text-foreground">No pending records</p>
                            ) : kpis.pending.map((amount) => (
                                <div key={amount.currency} className="mt-2">
                                    <p className="text-3xl font-bold text-warning">{formatRecordedAmount(amount.total_volume)}</p>
                                    <p className="text-xs text-muted-foreground">{currencyLabel(amount.currency)}</p>
                                </div>
                            ))}
                        </div>
                        <Clock className="w-5 h-5 text-warning" />
                    </div>
                </div>
                <div className="bg-card border border-border p-5 rounded-xl overflow-hidden relative">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Settlement Fee Rate</p>
                            <p className="text-lg font-semibold text-foreground">Unavailable</p>
                            <p className="mt-1 text-xs text-muted-foreground">Fee data is not stored on payment records.</p>
                        </div>
                        <CircleSlash2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    {/* Decorative abstract shape */}
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart: Payment Method Transaction Counts */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-foreground mb-6">Transactions by Payment Method</h3>
                    <div className="h-72">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(val: number) => [val.toLocaleString('en-IN'), 'Transactions']}
                                        contentStyle={{
                                            backgroundColor: 'var(--sm-color-popover)',
                                            border: '1px solid var(--sm-color-border)',
                                            borderRadius: 'var(--sm-radius-md)',
                                            color: 'var(--sm-color-popover-foreground)',
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                             <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-muted-foreground">No payment traffic recorded.</span>
                            </div>
                        )}
                    </div>
                     <div className="flex justify-center gap-6 mt-2 flex-wrap">
                        {pieData.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                <span className="text-xs text-muted-foreground font-mono tracking-wide">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bar Chart: Node Transaction Counts */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-semibold text-foreground">Campuses by Transaction Count</h3>
                        <ArrowUpRight className="w-4 h-4 text-success" />
                    </div>
                    <div className="h-72">
                        {barData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sm-color-border)" horizontal={false} />
                                    <XAxis type="number" stroke="var(--sm-color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" stroke="var(--sm-color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={120} />
                                    <RechartsTooltip 
                                        formatter={(val: number) => [val.toLocaleString('en-IN'), 'Transactions']}
                                        contentStyle={{
                                            backgroundColor: 'var(--sm-color-popover)',
                                            border: '1px solid var(--sm-color-border)',
                                            borderRadius: 'var(--sm-radius-md)',
                                            color: 'var(--sm-color-popover-foreground)',
                                        }}
                                        cursor={{ fill: 'var(--sm-color-muted)' }}
                                    />
                                    <Bar dataKey="transactions" fill="var(--sm-color-chart3)" radius={[0, 4, 4, 0]}>
                                        {barData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                             <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-muted-foreground">No completed campus payment records found.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Raw Grid */}
             <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-border flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-foreground">Payment Method Summary</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-foreground">
                        <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Payment Method</th>
                                <th className="px-6 py-4 font-semibold">Currency</th>
                                <th className="px-6 py-4 font-semibold">Processed Count</th>
                                <th className="px-6 py-4 font-semibold text-right">Recorded Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {methodData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No completed payment records found.</td>
                                </tr>
                            ) : methodData.map((m) => (
                                <tr key={`${m.payment_method || 'UNKNOWN'}:${m.currency}`} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 font-mono font-medium text-info">{m.payment_method || 'UNKNOWN'}</td>
                                    <td className="px-6 py-4">{currencyLabel(m.currency)}</td>
                                    <td className="px-6 py-4 tabular-nums">{m.txn_count.toLocaleString()}</td>
                                    <td className="px-6 py-4 tabular-nums text-right font-semibold text-foreground">{formatRecordedAmount(m.total_volume)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Campus Summary</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-foreground">
                        <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Campus</th>
                                <th className="px-6 py-4 font-semibold">Currency</th>
                                <th className="px-6 py-4 font-semibold">Processed Count</th>
                                <th className="px-6 py-4 font-semibold text-right">Recorded Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {nodeData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No completed campus payment records found.</td>
                                </tr>
                            ) : nodeData.map((node) => (
                                <tr key={`${node.node_name}:${node.currency}`} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-foreground">{node.node_name}</td>
                                    <td className="px-6 py-4">{currencyLabel(node.currency)}</td>
                                    <td className="px-6 py-4 tabular-nums">{node.txn_count.toLocaleString()}</td>
                                    <td className="px-6 py-4 tabular-nums text-right font-semibold text-foreground">{formatRecordedAmount(node.total_volume)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
