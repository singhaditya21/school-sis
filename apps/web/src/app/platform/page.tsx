import { getGlobalPlatformStats, getAllPlatformTenants } from '@/lib/actions/platform';

export default async function PlatformDashboard() {
    const stats = await getGlobalPlatformStats();
    const tenants = await getAllPlatformTenants();

    return (
        <div className="max-w-7xl mx-auto space-y-10">
            <div>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Global Command Center</h1>
                <p className="text-slate-500 mt-2 text-lg">Monitoring real-time telemetry across all multi-tenant deployments.</p>
            </div>

            {/* Global Telemetry Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Tenants</p>
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold text-slate-900">{stats.totalSchools}</span>
                        <span className="text-sm font-medium text-emerald-600 mb-1">+12 this month</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Platform ARR</p>
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold text-slate-900">${(stats.totalARR / 1000000).toFixed(1)}M</span>
                        <span className="text-sm font-medium text-emerald-600 mb-1">+4.2% MRR Growth</span>
                    </div>
                </div>
                <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-600/20 border border-indigo-500">
                    <p className="text-sm font-semibold text-indigo-200 uppercase tracking-wider mb-2">Active Students</p>
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold text-white">{stats.totalActiveStudents.toLocaleString()}</span>
                        <span className="text-sm font-medium text-indigo-200 mb-1">Globally Networked</span>
                    </div>
                </div>
                <div className="bg-rose-50 p-6 rounded-2xl shadow-sm border border-rose-200">
                    <p className="text-sm font-semibold text-rose-500 uppercase tracking-wider mb-2">Churn Risk (Past Due)</p>
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold text-rose-700">{stats.churnRiskSchools}</span>
                        <span className="text-sm font-medium text-rose-500 mb-1">Requires Attention</span>
                    </div>
                </div>
            </div>

            {/* Global Tenant Grid Mapping */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Active School Tenants</h2>
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">Tenant School</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">Code</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">SaaS Tier</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase text-right">Students</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase text-right">ARR Contribution</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tenants.map(tenant => (
                                <tr key={tenant.id} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <td className="p-5">
                                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{tenant.name}</div>
                                        <div className="text-xs text-slate-500">{tenant.adminEmail}</div>
                                    </td>
                                    <td className="p-5">
                                        <span className="font-mono text-sm text-slate-600 bg-slate-100 rounded px-2 py-1">{tenant.code}</span>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            tenant.subscriptionTier === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                            tenant.subscriptionTier === 'AI_PRO' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                                            'bg-slate-100 text-slate-700 border border-slate-200'
                                        }`}>
                                            {tenant.subscriptionTier}
                                        </span>
                                    </td>
                                    <td className="p-5 text-right font-medium text-slate-700">{tenant.activeStudents.toLocaleString()}</td>
                                    <td className="p-5 text-right font-medium text-slate-700">${tenant.revenue.toLocaleString()}</td>
                                    <td className="p-5 text-center">
                                        <span className={`inline-block w-3 h-3 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`}></span>
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
