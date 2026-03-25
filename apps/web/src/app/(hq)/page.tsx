import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function HQDashboardPage() {
    // Mock aggregated data for the HQ dashboard
    const stats = {
        totalCampuses: 12,
        activeStudents: 14502,
        monthlyRevenue: 12450000,
        aiAgentsActive: 26,
        anomaliesDetected: 3
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Global Command Center</h1>
                    <p className="text-slate-400 mt-1">Multi-campus orchestration and aggregated ecosystem metrics.</p>
                </div>
                <div className="flex gap-3">
                    <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Export Report
                    </button>
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        + Provision New Campus
                    </button>
                </div>
            </div>

            {/* Core KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400">Total Deployments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">{stats.totalCampuses}</div>
                        <p className="text-xs text-emerald-400 mt-1 flex items-center">
                            <span className="mr-1">↑</span> 2 added this quarter
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400">Total Enrolment</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">{stats.activeStudents.toLocaleString()}</div>
                        <p className="text-xs text-emerald-400 mt-1 flex items-center">
                            <span className="mr-1">↑</span> 8.4% YoY Growth
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400">Global MRR (INR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">₹{(stats.monthlyRevenue / 100000).toFixed(2)}L</div>
                        <p className="text-xs text-emerald-400 mt-1 flex items-center">
                            <span className="mr-1">↑</span> ₹12.4L vs last month
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-rose-950/20 border-rose-900/50 text-slate-100 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-rose-400">System Anomalies</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-rose-400">{stats.anomaliesDetected}</div>
                        <p className="text-xs text-rose-400/80 mt-1 flex items-center">
                            Requires immediate review
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Campus Matrix */}
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
                                    <th className="px-6 py-4">Region</th>
                                    <th className="px-6 py-4">Students</th>
                                    <th className="px-6 py-4">Compliance Status</th>
                                    <th className="px-6 py-4">Risk Level</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {[
                                    { name: 'Delhi Main Campus', region: 'North India', students: 4250, compliance: 'VERIFIED', risk: 'LOW' },
                                    { name: 'Mumbai International', region: 'West India', students: 3100, compliance: 'VERIFIED', risk: 'LOW' },
                                    { name: 'Bangalore Tech Park', region: 'South India', students: 2800, compliance: 'PENDING_AUDIT', risk: 'MEDIUM' },
                                    { name: 'Pune Coaching Hub', region: 'West India', students: 1100, compliance: 'ACTION_REQ', risk: 'HIGH' },
                                    { name: 'Dubai Branch', region: 'MENA', students: 850, compliance: 'VERIFIED', risk: 'LOW' },
                                ].map((c, i) => (
                                    <tr key={i} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-white">{c.name}</td>
                                        <td className="px-6 py-4 text-slate-400">{c.region}</td>
                                        <td className="px-6 py-4 font-mono">{c.students.toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                c.compliance === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                c.compliance === 'PENDING_AUDIT' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                                'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                            }`}>
                                                {c.compliance.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`flex items-center gap-1.5 ${
                                                c.risk === 'LOW' ? 'text-emerald-400' : 
                                                c.risk === 'MEDIUM' ? 'text-amber-400' : 
                                                'text-rose-400'
                                            }`}>
                                                <div className={`w-2 h-2 rounded-full ${
                                                c.risk === 'LOW' ? 'bg-emerald-400' : 
                                                c.risk === 'MEDIUM' ? 'bg-amber-400 animate-pulse' : 
                                                'bg-rose-400 animate-bounce'
                                                }`} />
                                                {c.risk}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-indigo-400 hover:text-indigo-300 font-medium text-sm">Manage →</button>
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
