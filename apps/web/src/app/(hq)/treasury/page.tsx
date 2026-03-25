import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TreasuryRoutingPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Treasury & Gateway Routing</h1>
                    <p className="text-slate-400 mt-1">Configure payment gateways, settlement accounts, and fee splits across multiple campuses.</p>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + Add Payment Gateway
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-2 bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader>
                        <CardTitle className="text-lg">Active Gateway Configurations</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-700/50">
                            {[
                                { campus: 'Delhi Main Campus', gateway: 'Razorpay', type: 'Primary Collection', id: 'rzp_live_k8J9...', status: 'ACTIVE' },
                                { campus: 'Mumbai International', gateway: 'Stripe', type: 'International Collections', id: 'pk_live_51M...', status: 'ACTIVE' },
                                { campus: 'Bangalore Tech Park', gateway: 'Razorpay', type: 'Primary Collection', id: 'rzp_live_m3N2...', status: 'ACTIVE' },
                                { campus: 'Pune Coaching Hub', gateway: 'Razorpay Route', type: 'Franchise Split (80/20)', id: 'rzp_live_f7P1...', status: 'PENDING_KYC' },
                            ].map((g, i) => (
                                <div key={i} className="p-5 flex items-center justify-between hover:bg-slate-800/80 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-10 h-10 rounded shadow-sm flex items-center justify-center font-bold text-lg ${g.gateway === 'Razorpay' || g.gateway === 'Razorpay Route' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'}`}>
                                            {g.gateway[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">{g.campus}</h3>
                                            <p className="text-sm text-slate-400 mt-0.5">{g.gateway} • {g.type}</p>
                                            <p className="text-xs text-slate-500 font-mono mt-1 mt-1 font-mono tracking-wider">{g.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                            g.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        }`}>
                                            {g.status}
                                        </span>
                                        <button className="text-xs font-semibold text-indigo-400 border hover:bg-indigo-500/10 border-indigo-500/30 px-3 py-1.5 rounded transition-colors">
                                            Configure
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                        <CardHeader className="pb-3 border-b border-slate-700/50">
                            <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Gateway Health</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Total Volume (30d)</span>
                                <span className="font-semibold text-white">₹14.2 Cr</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Success Rate</span>
                                <span className="font-semibold text-emerald-400">98.4%</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Chargebacks</span>
                                <span className="font-semibold text-rose-400">0.02%</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Webhook Sync</span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Healthy
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-indigo-900/40 to-slate-800/50 border-indigo-500/30">
                        <CardContent className="p-5">
                            <h3 className="font-semibold text-white mb-2">Automated Reconciliation</h3>
                            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                                The `CollectionsAgent` currently handles T+1 reconciliation automatically. Uploading bank MT940 statements here will trigger the AI pipeline for anomaly detection.
                            </p>
                            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                                Upload Bank Statement
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
