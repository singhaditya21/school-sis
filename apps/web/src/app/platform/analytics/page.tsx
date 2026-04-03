import { getPlatformAIAnalytics } from '@/lib/actions/platform';

export default async function AIAnalyticsPage() {
    const data = await getPlatformAIAnalytics();

    // Fallback if no logs exist yet
    const hasData = data.totalQueries > 0;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AI Economics</h1>
                <p className="text-slate-500 mt-1">Real-time telemetry of API burn rates versus computed platform inference.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-50 rounded-bl-[100px] z-0"></div>
                    <div className="relative z-10">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Queries</p>
                        <span className="text-4xl font-bold text-slate-900">{hasData ? data.totalQueries.toLocaleString() : '0'}</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Tokens Processed</p>
                    <span className="text-4xl font-bold text-slate-900">{hasData ? (data.totalTokens / 1000).toFixed(1) : '0'}k</span>
                </div>
                <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 shadow-sm">
                    <p className="text-sm font-semibold text-rose-600 uppercase tracking-wider mb-2">Compute Expense</p>
                    <span className="text-4xl font-bold text-rose-700">${hasData ? data.totalCostUsd.toFixed(4) : '0.00'}</span>
                </div>
                <div className="bg-emerald-600 p-6 rounded-2xl shadow-lg shadow-emerald-600/20 border border-emerald-500">
                    <p className="text-sm font-semibold text-emerald-200 uppercase tracking-wider mb-2">Primary Target Model</p>
                    <span className="text-2xl font-bold text-white">
                        {hasData ? Object.keys(data.modelStats)[0] || 'N/A' : 'Awaiting Engine'}
                    </span>
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-5">Agent Workload Distribution</h2>
                {!hasData ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 italic">No telemetry logs tracked yet across the company matrix.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.entries(data.agentStats).map(([agentName, stats]) => (
                            <div key={agentName} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-indigo-200 transition">
                                <h3 className="font-bold text-slate-900 mb-4">{agentName}</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-2">
                                        <span className="text-slate-500">Node Invocations</span>
                                        <span className="font-bold text-indigo-700">{stats.queries.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Network Drain</span>
                                        <span className="font-bold text-rose-600">${stats.cost.toFixed(4)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
