export default function AIAnalyticsPage() {
    const agents = [
        { name: 'Fee Intelligence Agent', queries: 12450, avgLatency: '1.2s', accuracy: '94%', status: 'HEALTHY' },
        { name: 'Defaulter Risk Agent', queries: 8900, avgLatency: '2.1s', accuracy: '91%', status: 'HEALTHY' },
        { name: 'Admission Funnel Agent', queries: 5600, avgLatency: '1.8s', accuracy: '89%', status: 'HEALTHY' },
        { name: 'Attendance Pattern Agent', queries: 15200, avgLatency: '0.9s', accuracy: '96%', status: 'HEALTHY' },
        { name: 'Transport Route Agent', queries: 3400, avgLatency: '1.5s', accuracy: '92%', status: 'DEGRADED' },
        { name: 'Communication Agent', queries: 7800, avgLatency: '1.1s', accuracy: '93%', status: 'HEALTHY' },
        { name: 'Academic Performance Agent', queries: 9100, avgLatency: '2.4s', accuracy: '88%', status: 'HEALTHY' },
        { name: 'HR & Payroll Agent', queries: 2100, avgLatency: '1.7s', accuracy: '90%', status: 'HEALTHY' },
    ];

    const totalQueries = agents.reduce((s, a) => s + a.queries, 0);
    const healthyCount = agents.filter(a => a.status === 'HEALTHY').length;

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AI Agent Analytics</h1>
                <p className="text-slate-500 mt-1">Monitor inference performance, accuracy, and health across all 26 specialized agents.</p>
            </div>

            {/* AI Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Queries (30d)</p>
                    <span className="text-4xl font-bold text-slate-900">{totalQueries.toLocaleString()}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Avg Latency</p>
                    <span className="text-4xl font-bold text-slate-900">1.6s</span>
                </div>
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-2">Agents Healthy</p>
                    <span className="text-4xl font-bold text-emerald-700">{healthyCount}/{agents.length}</span>
                </div>
                <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-600/20 border border-indigo-500">
                    <p className="text-sm font-semibold text-indigo-200 uppercase tracking-wider mb-2">Model</p>
                    <span className="text-2xl font-bold text-white">Qwen 7B</span>
                    <p className="text-xs text-indigo-300 mt-1">Q5_K_M Quantized</p>
                </div>
            </div>

            {/* Agent Performance Grid */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-5">Agent Performance Grid</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {agents.map((agent, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                                    agent.status === 'HEALTHY' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                }`}></span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    agent.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                }`}>{agent.status}</span>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm mb-3">{agent.name}</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Queries</span>
                                    <span className="font-medium text-slate-900">{agent.queries.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Latency</span>
                                    <span className="font-medium text-slate-900">{agent.avgLatency}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Accuracy</span>
                                    <span className="font-medium text-emerald-600">{agent.accuracy}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
