'use client';

import React from 'react';
import { PlatformTenant, PlatformStats } from '@/lib/actions/platform';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Building2, Users, DollarSign, AlertTriangle, PlayCircle, Ban } from 'lucide-react';

const COLORS = ['#818cf8', '#34d399', '#f472b6']; // Indigo, Emerald, Pink

export default function TenantsClient({ initialTenants, stats }: { initialTenants: PlatformTenant[], stats: PlatformStats }) {
    // Generate MRR Distribution logic for Recharts
    const tierData = [
        { name: 'CORE', value: initialTenants.filter(t => t.subscriptionTier === 'CORE').length },
        { name: 'AI_PRO', value: initialTenants.filter(t => t.subscriptionTier === 'AI_PRO').length },
        { name: 'ENTERPRISE', value: initialTenants.filter(t => t.subscriptionTier === 'ENTERPRISE').length },
    ];

    const revenueData = [
        { name: 'CORE', revenue: initialTenants.filter(t => t.subscriptionTier === 'CORE').reduce((a,b) => a + b.revenue, 0) },
        { name: 'AI_PRO', revenue: initialTenants.filter(t => t.subscriptionTier === 'AI_PRO').reduce((a,b) => a + b.revenue, 0) },
        { name: 'ENTERPRISE', revenue: initialTenants.filter(t => t.subscriptionTier === 'ENTERPRISE').reduce((a,b) => a + b.revenue, 0) },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Campus Management</h1>
                <p className="text-sm text-slate-400 mt-1">Multi-tenant fleet deployment mapping and subscription tier distributions.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Fleet Count</p>
                            <p className="text-3xl font-bold text-white">{stats.totalSchools}</p>
                        </div>
                        <Building2 className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Global Active Students</p>
                            <p className="text-3xl font-bold text-white">{stats.totalActiveStudents}</p>
                        </div>
                        <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Platform ARR</p>
                            <p className="text-3xl font-bold text-white">${(stats.totalARR / 1000).toFixed(1)}k</p>
                        </div>
                        <DollarSign className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-red-900/50 bg-red-950/10 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-400 mb-1">Churn Risks (>90d No Pay)</p>
                            <p className="text-3xl font-bold text-red-500">{stats.churnRiskSchools}</p>
                        </div>
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                </div>
            </div>

            {/* Recharts Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Tier Distribution (Node Count)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={tierData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {tierData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                        {tierData.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }}></span>
                                <span className="text-xs text-slate-400">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Revenue Velocity by Tier</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    cursor={{ fill: '#1e293b' }}
                                />
                                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                                    {revenueData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* SaaS Data Grid */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Telemetric Node Status</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Campus Name</th>
                                <th className="px-6 py-4 font-semibold">Tier</th>
                                <th className="px-6 py-4 font-semibold">Active Students</th>
                                <th className="px-6 py-4 font-semibold">Agg Revenue</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {initialTenants.map((tenant) => (
                                <tr key={tenant.id} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-200">{tenant.name}</div>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{tenant.code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            tenant.subscriptionTier === 'ENTERPRISE' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                            tenant.subscriptionTier === 'AI_PRO' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                                            'bg-slate-800 text-slate-400 border border-slate-700'
                                        }`}>
                                            {tenant.subscriptionTier}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 tabular-nums">
                                        {tenant.activeStudents.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-emerald-400 tabular-nums">
                                        ${tenant.revenue.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                                            <span className="text-xs font-medium text-slate-400">{tenant.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button title="Impersonate Node" className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors">
                                                <PlayCircle className="w-4 h-4" />
                                            </button>
                                            <button title="Suspend Node" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
