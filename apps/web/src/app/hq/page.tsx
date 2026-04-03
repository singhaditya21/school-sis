import { getGlobalPlatformStats, getAllPlatformTenants } from '@/lib/actions/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Building, Users, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default async function HQDashboardPage() {
    const stats = await getGlobalPlatformStats();
    const tenants = await getAllPlatformTenants();
    const arrMillion = (stats.totalARR / 1000000).toFixed(2);

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Global Command Center</h1>
                    <p className="text-slate-400 mt-1">Real-time telemetry across all multi-tenant enclaves.</p>
                </div>
                <Link href="/hq/tenants" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + Provision New Campus
                </Link>
            </div>

            {/* Core KPIs — wired to real DB */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 border-indigo-500 text-white shadow-xl shadow-indigo-600/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-indigo-100 flex items-center justify-between">
                            Platform ARR
                            <TrendingUp className="w-4 h-4 text-indigo-200" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black tracking-tight">${arrMillion}M</div>
                        <p className="text-xs text-emerald-300 mt-1">Live from billing engine</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                            Active Tenants
                            <Building className="w-4 h-4 text-slate-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">{stats.totalSchools}</div>
                        <p className="text-xs text-emerald-400 mt-1">Live tenant count</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                            Total Enrolment
                            <Users className="w-4 h-4 text-slate-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">{stats.totalActiveStudents.toLocaleString()}</div>
                        <p className="text-xs text-emerald-400 mt-1">Active students across all nodes</p>
                    </CardContent>
                </Card>

                <Card className="bg-rose-950/20 border-rose-900/50 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-rose-400 flex items-center justify-between">
                            Churn Risk
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-rose-400">{stats.churnRiskSchools}</div>
                        <p className="text-xs text-rose-400/80 mt-1">Schools at risk (no payment 90d)</p>
                    </CardContent>
                </Card>
            </div>

            {/* Campus Fleet Matrix — wired to real DB */}
            <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                <CardHeader>
                    <CardTitle className="text-lg">Campus Fleet Matrix</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 border-y border-slate-700 text-xs text-slate-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Campus Name</th>
                                    <th className="px-6 py-4">Code</th>
                                    <th className="px-6 py-4">Admin</th>
                                    <th className="px-6 py-4">Students</th>
                                    <th className="px-6 py-4">Tier</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {tenants.length === 0 && (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No tenants provisioned yet.</td></tr>
                                )}
                                {tenants.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-white">{t.name}</td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{t.code}</td>
                                        <td className="px-6 py-4 text-slate-400">{t.adminEmail}</td>
                                        <td className="px-6 py-4 font-mono">{t.activeStudents.toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                t.subscriptionTier === 'ENTERPRISE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                t.subscriptionTier === 'AI_PRO' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>
                                                {t.subscriptionTier}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`flex items-center gap-1.5 ${t.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                <div className={`w-2 h-2 rounded-full ${t.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
                                                {t.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
