'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { AreaChart as AreaChartIcon, Target, Users, Mail, Phone, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const COLORS = {
    'NEW': '#3b82f6',        // Blue
    'CONTACTED': '#f59e0b',  // Amber
    'CLOSED': '#10b981',     // Emerald
};

export default function LeadsClient({ statusData, leads, kpis }: { statusData: any[], leads: any[], kpis: any }) {

    // Format Data for Recharts
    const funnelData = [
        { name: 'Initial Contact', stage: 'NEW', value: Number(statusData.find(s => s.status === 'NEW')?.count || 0) },
        { name: 'Engaged', stage: 'CONTACTED', value: Number(statusData.find(s => s.status === 'CONTACTED')?.count || 0) },
        { name: 'Converted', stage: 'CLOSED', value: Number(statusData.find(s => s.status === 'CLOSED')?.count || 0) },
    ];

    const totalCapacity = statusData.reduce((a, b) => a + Number(b.capacity), 0);
    const totalLeads = statusData.reduce((a, b) => a + Number(b.count), 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Demand Generation Pipeline</h1>
                <p className="text-sm text-slate-400 mt-1">B2B SaaS Lead Lifecycle & Pipeline Velocity metrics.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Open Pipeline MRR Value</p>
                            <p className="text-3xl font-bold text-emerald-400">${(kpis.pipelineValue).toLocaleString()}</p>
                        </div>
                        <Target className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Pipeline Capacity</p>
                            <p className="text-3xl font-bold text-white">{totalCapacity.toLocaleString()} <span className="text-sm font-normal text-slate-500">Seats</span></p>
                        </div>
                        <Users className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Prospects</p>
                            <p className="text-3xl font-bold text-white">{totalLeads}</p>
                        </div>
                        <AreaChartIcon className="w-5 h-5 text-pink-400" />
                    </div>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-6">Pipeline Velocity Funnel</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                            <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                cursor={{ fill: '#1e293b' }}
                            />
                            <Bar dataKey="value" barSize={32} radius={[0, 4, 4, 0]}>
                                {funnelData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[entry.stage as keyof typeof COLORS] || '#475569'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Raw Grid */}
             <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Prospect Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Discovery Date</th>
                                <th className="px-6 py-4 font-semibold">School Lead</th>
                                <th className="px-6 py-4 font-semibold">Contact Point</th>
                                <th className="px-6 py-4 font-semibold">Capacity</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {leads.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        No active inbound leads detected.
                                    </td>
                                </tr>
                            )}
                            {leads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 text-xs text-slate-400">
                                        {format(new Date(lead.created_at), 'MMM d, yyyy')}
                                    </td>
                                    <td className="px-6 py-4 font-semibold text-white">
                                        {lead.school_name}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-3 h-3 text-slate-500" />
                                            {lead.contact_email}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">{lead.contact_name}</div>
                                    </td>
                                    <td className="px-6 py-4 tabular-nums">
                                        {lead.student_capacity.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1.5 rounded-md text-xs font-medium tracking-wide ${
                                            lead.status === 'NEW' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                            lead.status === 'CONTACTED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                            'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                         <div className="flex items-center justify-end gap-2">
                                            <button title="Create Tenant" className="p-1 text-slate-400 hover:text-indigo-400 transition-colors">
                                                <ExternalLink className="w-4 h-4" />
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
