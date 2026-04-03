'use client';

import React from 'react';
import { Megaphone, Activity, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function BroadcastsClient({ broadcastsData }: { broadcastsData: any[] }) {
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Fleet Broadcast Engine</h1>
                    <p className="text-sm text-slate-400 mt-1">Cross-tenant global announcements and telemetry pulsing.</p>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                    + Deploy New Broadcast
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Active Signals</p>
                            <p className="text-3xl font-bold text-cyan-400">{broadcastsData.filter(b => b.isActive).length}</p>
                        </div>
                        <Activity className="w-5 h-5 text-cyan-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Deployed</p>
                            <p className="text-3xl font-bold text-white">{broadcastsData.length}</p>
                        </div>
                        <Megaphone className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Average Open Rate</p>
                            <p className="text-3xl font-bold text-emerald-400">84%</p>
                        </div>
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
            </div>

             <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Broadcast Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Deployment Date</th>
                                <th className="px-6 py-4 font-semibold">Signal Type</th>
                                <th className="px-6 py-4 font-semibold">Payload Title</th>
                                <th className="px-6 py-4 font-semibold">Target Nodes</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {broadcastsData.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No broadcasts emitted.</td></tr>
                            ) : null}
                            {broadcastsData.map((b, i) => (
                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                                        {format(new Date(b.createdAt), 'yyyy-MM-dd HH:mm')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold tracking-widest ${
                                            b.type === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                            b.type === 'WARNING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                            b.type === 'MAINTENANCE' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                            'bg-slate-800 text-slate-400 border border-slate-700'
                                        }`}>
                                            {b.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-white">{b.title}</td>
                                    <td className="px-6 py-4 text-xs text-slate-400">
                                        {b.targetTiers?.join(', ') || 'ALL TIERS'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {b.isActive ? (
                                            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div> Active
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 font-medium">Archived</span>
                                        )}
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
