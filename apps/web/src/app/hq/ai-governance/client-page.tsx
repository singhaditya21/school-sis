'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Cpu, DollarSign, Zap } from 'lucide-react';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981'];

export default function AIGovernanceClient({ modelData, agentData, kpis }: { modelData: any[], agentData: any[], kpis: any }) {
    // Format Pie chart data for Model Cost Distribution
    const costPieData = modelData.map((d) => ({
        name: d.model,
        value: Number(d.total_cost)
    }));

    // Format Bar chart data for Agent Token Usage
    const agentBarData = agentData.map((d) => ({
        name: d.agent_type,
        tokens: Number(d.total_tokens)
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">AI Governance Engine</h1>
                <p className="text-sm text-slate-400 mt-1">Multi-model intelligence telemetry and token economics.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Global Compute Burn</p>
                            <p className="text-3xl font-bold text-white">${kpis.totalCost.toFixed(2)}</p>
                        </div>
                        <DollarSign className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Network Tokens</p>
                            <p className="text-3xl font-bold text-white">{(kpis.totalTokens / 1000).toFixed(1)}k</p>
                        </div>
                        <Cpu className="w-5 h-5 text-cyan-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Active LLM Endpoints</p>
                            <p className="text-3xl font-bold text-white">{modelData.length}</p>
                        </div>
                        <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart: Compute Spend by Model */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Compute Drain by Model Hash</h3>
                    <div className="h-64">
                        {costPieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={costPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {costPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cost']}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-slate-500">No telemetry nodes active.</span>
                            </div>
                        )}
                    </div>
                     <div className="flex justify-center gap-6 mt-4">
                        {costPieData.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                <span className="text-xs text-slate-400 font-mono">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bar Chart: Agent Usage */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Token Burn per Agent Module</h3>
                    <div className="h-64">
                        {agentBarData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={agentBarData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                                    <RechartsTooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                        cursor={{ fill: '#1e293b' }}
                                    />
                                    <Bar dataKey="tokens" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <span className="text-sm text-slate-500">No agent transactions.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Raw Grid */}
             <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Agent Vector Logs</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Agent Class</th>
                                <th className="px-6 py-4 font-semibold">Network Calls</th>
                                <th className="px-6 py-4 font-semibold">Tokens Assimilated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {agentData.map((agent, i) => (
                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-cyan-400">{agent.agent_type}</td>
                                    <td className="px-6 py-4">{agent.request_count}</td>
                                    <td className="px-6 py-4 tabular-nums">{agent.total_tokens.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
