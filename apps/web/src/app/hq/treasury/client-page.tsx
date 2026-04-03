'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Banknote, Landmark, Clock, ArrowUpRight } from 'lucide-react';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444']; // Indigo, Cyan, Amber, Emerald, Red

export default function TreasuryClient({ methodData, nodeData, kpis }: { methodData: any[], nodeData: any[], kpis: any }) {

    // Format Data
    const pieData = methodData.map(m => ({
        name: m.payment_method || 'UNKNOWN',
        value: Number(m.total_volume)
    }));

    const barData = nodeData.map(n => ({
        name: n.node_name,
        volume: Number(n.total_volume)
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Global Treasury Routing</h1>
                <p className="text-sm text-slate-400 mt-1">Cross-node financial reconciliation and macroscopic payment traffic.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Global Gross Volume (GGV)</p>
                            <p className="text-3xl font-bold text-emerald-400">${(kpis.totalVolume).toLocaleString()}</p>
                        </div>
                        <Landmark className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Unreconciled / Pending Cashflow</p>
                            <p className="text-3xl font-bold text-amber-500">${(kpis.totalPending).toLocaleString()}</p>
                        </div>
                        <Clock className="w-5 h-5 text-amber-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl overflow-hidden relative">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Average Fleet Take Rate</p>
                            <p className="text-3xl font-bold text-white">4.2%</p>
                        </div>
                        <Banknote className="w-5 h-5 text-indigo-400" />
                    </div>
                    {/* Decorative abstract shape */}
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart: Payment Method */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Volume by Payment Matrix</h3>
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
                                        formatter={(val: number) => [`$${val.toLocaleString()}`, 'Processed']}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                             <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-slate-500">No payment traffic recorded.</span>
                            </div>
                        )}
                    </div>
                     <div className="flex justify-center gap-6 mt-2 flex-wrap">
                        {pieData.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                <span className="text-xs text-slate-400 font-mono tracking-wide">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bar Chart: Node Volume */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-semibold text-white">Top Generating Campuses</h3>
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="h-72">
                        {barData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                                    <XAxis type="number" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={120} />
                                    <RechartsTooltip 
                                        formatter={(val: number) => [`$${val.toLocaleString()}`, 'Volume']}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                        cursor={{ fill: '#1e293b' }}
                                    />
                                    <Bar dataKey="volume" fill="#0ea5e9" radius={[0, 4, 4, 0]}>
                                        {barData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                             <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-slate-500">No node traffic recorded.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Raw Grid */}
             <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Method Ledger (GGV)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Payment Vector</th>
                                <th className="px-6 py-4 font-semibold">Processed Count</th>
                                <th className="px-6 py-4 font-semibold text-right">Volume Processed (USD)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {methodData.map((m, i) => (
                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 font-mono font-medium text-cyan-400">{m.payment_method || 'UNKNOWN'}</td>
                                    <td className="px-6 py-4 tabular-nums">{m.txn_count.toLocaleString()}</td>
                                    <td className="px-6 py-4 tabular-nums text-right font-semibold text-white">${Number(m.total_volume).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
