import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AIGovernancePage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <span className="text-indigo-400">🧠</span> AI Fleet Governance
                    </h1>
                    <p className="text-slate-400 mt-1">Real-time telemetrics for the 26 deployed ScholarMind agents.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-sm text-emerald-400 font-medium px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                        Pipeline Sync: CONNECTED
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Global Token Burn (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">4.2M <span className="text-sm font-medium text-slate-500 font-mono tracking-wider ml-1">TKN</span></div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Active Tool Invocations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">1,452 <span className="text-sm font-medium text-emerald-400 ml-1">98% succ</span></div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Avg Generation Latency</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">1,240 <span className="text-sm font-medium text-slate-500 ml-1">ms / req</span></div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Vector Embedding Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">2.4 <span className="text-sm font-medium text-slate-500 ml-1">GB / pgvector</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-800/50 border-slate-700 text-slate-100 overflow-hidden">
                <CardHeader className="border-b border-slate-700/50 pb-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Agent Telemetrics</CardTitle>
                    <div className="text-xs text-slate-500 font-mono">llama.cpp • Qwen-2.5-7B • 0.0.0.0:8081</div>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900/50 border-b border-slate-700/50 text-xs text-slate-400 font-semibold uppercase">
                            <tr>
                                <th className="px-6 py-3">Agent ID</th>
                                <th className="px-6 py-3">Primary Domain</th>
                                <th className="px-6 py-3">Vector Collections</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {[
                                { id: 'FeeAgent', domain: 'Finance & Invoicing', collections: ['invoices', 'receipts'], status: 'ACTIVE' },
                                { id: 'AttendAgent', domain: 'Attendance Anomalies', collections: ['attendance_logs'], status: 'ACTIVE' },
                                { id: 'RiskAgent', domain: 'Safeguarding & Welfare', collections: ['student_profiles', 'incidents'], status: 'ACTIVE' },
                                { id: 'AcademAgent', domain: 'Curriculum & Grading', collections: ['grades', 'lesson_plans'], status: 'ACTIVE' },
                                { id: 'SynthesisAgent', domain: 'Cross-Domain Executive', collections: ['*'], status: 'ACTIVE' },
                                { id: 'PlacementAgent', domain: 'Campus Recruitment', collections: ['applications'], status: 'IDLE' },
                            ].map((a, i) => (
                                <tr key={i} className="hover:bg-slate-800/80 transition-colors">
                                    <td className="px-6 py-4 font-mono font-medium text-indigo-300">{a.id}</td>
                                    <td className="px-6 py-4 text-slate-200">{a.domain}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            {a.collections.map((col, idx) => (
                                                <span key={idx} className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-xs text-slate-400 font-mono">
                                                    {col}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                            a.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-white transition-colors">Configure</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
