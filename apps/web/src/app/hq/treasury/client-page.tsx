'use client';

import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Landmark, Clock, AlertTriangle, Percent, Building2, Info } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export interface CampusFinanceRow {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    tier: string;
    groupId: string | null;
    groupName: string | null;
    groupRegion: string | null;
    campusType: string | null;
    billed: number;
    collected: number;
    overdue: number;
    activeStudents: number;
    cash90d: number;
}

export interface MethodRow {
    method: string;
    volume: number;
    txnCount: number;
}

export interface MonthRow {
    month: string;
    collected: number;
}

const SERIES = {
    collected: '#10b981',
    outstanding: '#f59e0b',
    overdue: '#f43f5e',
};

const METHOD_COLORS = ['#818cf8', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa'];

function outstandingOf(row: CampusFinanceRow) {
    return Math.max(row.billed - row.collected, 0);
}

function rateOf(row: { billed: number; collected: number }) {
    if (row.billed <= 0) return null;
    return (row.collected / row.billed) * 100;
}

function monthLabel(month: string) {
    const [year, mon] = month.split('-');
    const date = new Date(Number(year), Number(mon) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export default function TreasuryClient({
    campuses,
    methods,
    months,
    pendingCash,
}: {
    campuses: CampusFinanceRow[];
    methods: MethodRow[];
    months: MonthRow[];
    pendingCash: number;
}) {
    const groupedCampuses = useMemo(
        () => campuses.filter((c) => c.groupId !== null),
        [campuses],
    );
    const isGrouped = groupedCampuses.length > 0;

    const [scope, setScope] = useState<'ALL' | string>('ALL');

    const groups = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of campuses) {
            if (c.groupId && c.groupName) map.set(c.groupId, c.groupName);
        }
        return Array.from(map, ([id, name]) => ({ id, name }));
    }, [campuses]);

    const visible = useMemo(
        () => (scope === 'ALL' ? campuses : campuses.filter((c) => c.groupId === scope)),
        [campuses, scope],
    );

    const totals = useMemo(() => {
        return visible.reduce(
            (acc, c) => ({
                billed: acc.billed + c.billed,
                collected: acc.collected + c.collected,
                overdue: acc.overdue + c.overdue,
                students: acc.students + c.activeStudents,
            }),
            { billed: 0, collected: 0, overdue: 0, students: 0 },
        );
    }, [visible]);

    const totalOutstanding = Math.max(totals.billed - totals.collected, 0);
    const totalRate = rateOf(totals);

    // Region rollup only exists where campuses are actually mapped to a group.
    const regionRollup = useMemo(() => {
        const map = new Map<string, { region: string; campuses: number; billed: number; collected: number; overdue: number }>();
        for (const c of visible) {
            if (!c.groupRegion) continue;
            const entry = map.get(c.groupRegion) ?? {
                region: c.groupRegion, campuses: 0, billed: 0, collected: 0, overdue: 0,
            };
            entry.campuses += 1;
            entry.billed += c.billed;
            entry.collected += c.collected;
            entry.overdue += c.overdue;
            map.set(c.groupRegion, entry);
        }
        return Array.from(map.values()).sort((a, b) => b.billed - a.billed);
    }, [visible]);

    const comparisonData = useMemo(
        () =>
            visible
                .filter((c) => c.billed > 0)
                .slice(0, 12)
                .map((c) => ({
                    name: c.name,
                    collected: c.collected,
                    outstanding: outstandingOf(c),
                })),
        [visible],
    );

    const trendData = useMemo(
        () => months.map((m) => ({ name: monthLabel(m.month), collected: Number(m.collected) })),
        [months],
    );

    const methodData = useMemo(
        () => methods.map((m) => ({ name: m.method, value: Number(m.volume), txns: m.txnCount })),
        [methods],
    );

    const worstPerformer = useMemo(() => {
        const withBilling = visible.filter((c) => c.billed > 0);
        if (withBilling.length < 2) return null;
        return withBilling.reduce((worst, c) =>
            (rateOf(c) ?? 100) < (rateOf(worst) ?? 100) ? c : worst,
        );
    }, [visible]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Cross-Campus Finance</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Billing and collection performance across every campus, from the fee ledger.
                    </p>
                </div>
                {groups.length > 0 && (
                    <div className="flex items-center gap-2">
                        <label htmlFor="hq-scope" className="text-xs uppercase tracking-widest text-muted-foreground">
                            Scope
                        </label>
                        <select
                            id="hq-scope"
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="ALL">All campuses</option>
                            {groups.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {!isGrouped && (
                <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 px-5 py-4">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        No campus is mapped to an HQ group yet, so these figures are a flat rollup of every tenant.
                        Create a group and attach campuses in the{' '}
                        <Link href="/hq/policies" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                            Global Policy Engine
                        </Link>{' '}
                        to compare by region.
                    </p>
                </div>
            )}

            {/* KPIs — all figures in rupees, straight from invoices/payments */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <Kpi
                    label="Billed"
                    value={formatCurrency(totals.billed)}
                    hint={`${visible.length} campus${visible.length === 1 ? '' : 'es'}`}
                    icon={<Landmark className="w-5 h-5 text-muted-foreground" />}
                />
                <Kpi
                    label="Collected"
                    value={formatCurrency(totals.collected)}
                    hint="Recorded against invoices"
                    tone="emerald"
                    icon={<Landmark className="w-5 h-5 text-emerald-500" />}
                />
                <Kpi
                    label="Outstanding"
                    value={formatCurrency(totalOutstanding)}
                    hint="Billed but not yet collected"
                    tone="amber"
                    icon={<Clock className="w-5 h-5 text-amber-400" />}
                />
                <Kpi
                    label="Overdue"
                    value={formatCurrency(totals.overdue)}
                    hint="Past due date, unpaid"
                    tone="rose"
                    icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
                />
                <Kpi
                    label="Collection rate"
                    value={totalRate === null ? '—' : `${totalRate.toFixed(1)}%`}
                    hint={totalRate === null ? 'Nothing billed yet' : 'Collected ÷ billed'}
                    icon={<Percent className="w-5 h-5 text-indigo-400" />}
                />
            </div>

            {pendingCash > 0 && (
                <p className="text-xs text-muted-foreground">
                    {formatCurrency(pendingCash)} of payment attempts are still <span className="font-mono">PENDING</span> and are
                    excluded from collected cash above.
                </p>
            )}

            {worstPerformer && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 px-5 py-4">
                    <p className="text-sm text-amber-200">
                        Lowest collection rate: <span className="font-semibold text-white">{worstPerformer.name}</span> at{' '}
                        {(rateOf(worstPerformer) ?? 0).toFixed(1)}% — {formatCurrency(outstandingOf(worstPerformer))} outstanding
                        {worstPerformer.overdue > 0 ? `, ${formatCurrency(worstPerformer.overdue)} of it already overdue.` : '.'}
                    </p>
                </div>
            )}

            {regionRollup.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {regionRollup.map((r) => {
                        const rate = rateOf(r);
                        return (
                            <div key={r.region} className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-white">{r.region}</span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Building2 className="w-3 h-3" /> {r.campuses}
                                    </span>
                                </div>
                                <p className="text-2xl font-bold text-white mt-3">{formatCurrency(r.collected)}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    collected of {formatCurrency(r.billed)} billed
                                    {rate === null ? '' : ` · ${rate.toFixed(1)}%`}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 xl:col-span-2">
                    <h3 className="text-sm font-semibold text-white mb-6">Collected vs outstanding by campus</h3>
                    <div className="h-80">
                        {comparisonData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        stroke="#475569"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v: number) => formatCurrency(v)}
                                    />
                                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={150} />
                                    <RechartsTooltip
                                        formatter={(v: number, key) => [formatCurrency(v), key === 'collected' ? 'Collected' : 'Outstanding']}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                        cursor={{ fill: '#1e293b' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                                    <Bar dataKey="collected" stackId="a" name="Collected" fill={SERIES.collected} />
                                    <Bar dataKey="outstanding" stackId="a" name="Outstanding" fill={SERIES.outstanding} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyChart message="No campus has been billed yet." />
                        )}
                    </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Cash collected by method</h3>
                    <div className="h-64">
                        {methodData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                                        {methodData.map((entry, index) => (
                                            <Cell key={entry.name} fill={METHOD_COLORS[index % METHOD_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        formatter={(v: number) => [formatCurrency(v), 'Collected']}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyChart message="No completed payments recorded." />
                        )}
                    </div>
                    <div className="mt-4 space-y-2">
                        {methodData.map((m, i) => (
                            <div key={m.name} className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length] }} />
                                    <span className="font-mono">{m.name}</span>
                                    <span className="text-muted-foreground">({m.txns})</span>
                                </span>
                                <span className="text-slate-200 tabular-nums">{formatCurrency(m.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-6">Collections by month (last 12 months, all campuses)</h3>
                <div className="h-64">
                    {trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis
                                    stroke="#475569"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v: number) => formatCurrency(v)}
                                    width={90}
                                />
                                <RechartsTooltip
                                    formatter={(v: number) => [formatCurrency(v), 'Collected']}
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                />
                                <Line type="monotone" dataKey="collected" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3, fill: '#22d3ee' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <EmptyChart message="No payments recorded in the last 12 months." />
                    )}
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Campus ledger</h3>
                    <p className="text-xs text-muted-foreground mt-1">Amounts in rupees, from invoices and completed payments.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-muted-foreground uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Campus</th>
                                <th className="px-6 py-4 font-semibold">Group / Region</th>
                                <th className="px-6 py-4 font-semibold text-right">Students</th>
                                <th className="px-6 py-4 font-semibold text-right">Billed</th>
                                <th className="px-6 py-4 font-semibold text-right">Collected</th>
                                <th className="px-6 py-4 font-semibold text-right">Outstanding</th>
                                <th className="px-6 py-4 font-semibold text-right">Overdue</th>
                                <th className="px-6 py-4 font-semibold">Collection rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {visible.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No campuses in this scope.</td>
                                </tr>
                            )}
                            {visible.map((c) => {
                                const rate = rateOf(c);
                                return (
                                    <tr key={c.id} className="hover:bg-slate-900/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-white flex items-center gap-2">
                                                {c.name}
                                                {!c.isActive && (
                                                    <span className="text-[10px] uppercase tracking-wider text-rose-400 border border-rose-900/60 rounded px-1.5 py-0.5">
                                                        Suspended
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{c.code} · {c.tier}</div>
                                        </td>
                                        <td className="px-6 py-4 text-xs">
                                            {c.groupName ? (
                                                <>
                                                    <div className="text-slate-300">{c.groupName}</div>
                                                    <div className="text-muted-foreground mt-0.5">{c.groupRegion} · {c.campusType}</div>
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums">{c.activeStudents.toLocaleString('en-IN')}</td>
                                        <td className="px-6 py-4 text-right tabular-nums">{formatCurrency(c.billed)}</td>
                                        <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{formatCurrency(c.collected)}</td>
                                        <td className="px-6 py-4 text-right tabular-nums text-amber-400">{formatCurrency(outstandingOf(c))}</td>
                                        <td className="px-6 py-4 text-right tabular-nums text-rose-400">{formatCurrency(c.overdue)}</td>
                                        <td className="px-6 py-4">
                                            {rate === null ? (
                                                <span className="text-xs text-muted-foreground">Not billed</span>
                                            ) : (
                                                <div className="flex items-center gap-3 min-w-[8rem]">
                                                    <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${Math.min(rate, 100)}%`,
                                                                backgroundColor: rate >= 85 ? SERIES.collected : rate >= 60 ? SERIES.outstanding : SERIES.overdue,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs tabular-nums text-slate-300 w-12 text-right">{rate.toFixed(1)}%</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Kpi({
    label, value, hint, icon, tone,
}: {
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone?: 'emerald' | 'amber' | 'rose';
}) {
    const valueTone =
        tone === 'emerald' ? 'text-emerald-400' :
        tone === 'amber' ? 'text-amber-400' :
        tone === 'rose' ? 'text-rose-400' : 'text-white';

    return (
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
                    <p className={`text-2xl font-bold tabular-nums ${valueTone}`}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{hint}</p>
                </div>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
}

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="h-full flex items-center justify-center">
            <span className="text-sm text-muted-foreground">{message}</span>
        </div>
    );
}
