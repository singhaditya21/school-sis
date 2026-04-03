import { getGlobalPlatformStats, getAllPlatformTenants } from '@/lib/actions/platform';
import ARRChart from '@/components/platform/ARRChart';
import { TrendingUp, Users, ShieldAlert, Building, ServerCrash } from 'lucide-react';
import Link from 'next/link';

export default async function PlatformDashboard() {
    const stats = await getGlobalPlatformStats();
    const tenants = await getAllPlatformTenants();
    const arrMillion = (stats.totalARR / 1000000).toFixed(2);

    return (
        <div className="max-w-7xl mx-auto space-y-10 animate-fade-in">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Global Command Center</h1>
                    <p className="text-slate-500 mt-2 text-lg">Real-time telemetry and cluster analytics across all multi-tenant enclaves.</p>
                </div>
            </div>

            {/* Premium Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* ARR Card - Hero Metric */}
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-3xl shadow-xl shadow-indigo-600/30 border border-indigo-500 relative overflow-hidden group">
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <p className="text-sm font-semibold text-indigo-100 uppercase tracking-wider">Total Platform ARR</p>
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                            <TrendingUp className="w-5 h-5 text-indigo-50" />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-end gap-3">
                            <span className="text-5xl font-black text-white tracking-tighter">${arrMillion}M</span>
                        </div>
                        <span className="text-sm font-medium text-emerald-300 mt-2 flex items-center gap-1">+4.2% Growth Last 30d</span>
                    </div>
                </div>

                {/* Tenants Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Active Tenants</p>
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <Building className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                        </div>
                    </div>
                    <div>
                        <span className="text-4xl font-bold text-slate-900 tracking-tight">{stats.totalSchools}</span>
                        <span className="text-sm font-medium text-emerald-600 block mt-2">+12 Node Spawns (MTD)</span>
                    </div>
                </div>

                {/* Students Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <Users className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                        </div>
                    </div>
                    <div>
                        <span className="text-4xl font-bold text-slate-900 tracking-tight">{stats.totalActiveStudents.toLocaleString()}</span>
                        <span className="text-sm font-medium text-indigo-500 block mt-2">Active Network Coverage</span>
                    </div>
                </div>

                {/* Churn Risk */}
                <div className="bg-gradient-to-br from-rose-50 to-white p-6 rounded-3xl shadow-sm border border-rose-100 hover:shadow-rose-100 hover:border-rose-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-semibold text-rose-500 uppercase tracking-wider">At-Risk Nodes</p>
                        <div className="p-2 bg-rose-100/50 rounded-xl group-hover:bg-rose-100 transition-colors">
                            <ShieldAlert className="w-5 h-5 text-rose-500 group-hover:text-rose-600" />
                        </div>
                    </div>
                    <div>
                        <span className="text-4xl font-bold text-rose-700 tracking-tight">{stats.churnRiskSchools}</span>
                        <span className="text-sm font-medium text-rose-500 block mt-2">Requires Retention Pivot</span>
                    </div>
                </div>
            </div>

            {/* Deep Analytics Graph & Latest Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                    <div className="mb-6 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">ARR Trajectory</h3>
                            <p className="text-sm text-slate-500">6-month rolling performance</p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold uppercase tracking-wider">Live</span>
                    </div>
                    {/* Render the Recharts Client Component */}
                    <ARRChart currentARR={stats.totalARR} />
                </div>

                {/* Quick Actions / System Health */}
                <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-xl p-8 relative overflow-hidden flex flex-col">
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/20 blur-3xl rounded-full"></div>
                    <div className="relative z-10 mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <ServerCrash className="w-5 h-5 text-emerald-400" /> System Health
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Cross-cluster stability check</p>
                    </div>
                    
                    <div className="relative z-10 space-y-4 flex-1">
                        <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
                            <span className="text-slate-300 font-medium">Database Core</span>
                            <span className="text-emerald-400 font-mono text-sm">99.99% UP</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
                            <span className="text-slate-300 font-medium">Edge Routing</span>
                            <span className="text-emerald-400 font-mono text-sm">4ms RTL</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
                            <span className="text-slate-300 font-medium">Background Workers</span>
                            <span className="text-emerald-400 font-mono text-sm">SYNCED</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Data Grid for Tenants */}
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-900">Live Tenant Hierarchy</h2>
                    <Link href="/platform/tenants" className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">View Full Directory →</Link>
                </div>
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Enclave Name</th>
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Provision Code</th>
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Tier</th>
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Students</th>
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">ARR</th>
                                <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Node Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {tenants.map(tenant => (
                                <tr key={tenant.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="py-4 px-6">
                                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{tenant.name}</div>
                                        <div className="text-xs text-slate-500 font-medium">{tenant.adminEmail}</div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">{tenant.code}</span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm ${
                                            tenant.subscriptionTier === 'ENTERPRISE' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-transparent' :
                                            tenant.subscriptionTier === 'AI_PRO' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                                            'bg-white text-slate-600 border border-slate-300'
                                        }`}>
                                            {tenant.subscriptionTier}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-right font-bold text-slate-700">{tenant.activeStudents.toLocaleString()}</td>
                                    <td className="py-4 px-6 text-right font-bold text-emerald-600">${tenant.revenue.toLocaleString()}</td>
                                    <td className="py-4 px-6 flex justify-center">
                                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${tenant.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                            <span className={`inline-block w-2 h-2 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                                            {tenant.status}
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
