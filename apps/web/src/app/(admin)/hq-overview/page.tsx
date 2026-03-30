'use client';

export default function HQDashboard() {
    return (
        <div className="max-w-7xl mx-auto p-8 bg-slate-50 min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Multi-Campus Global HQ</h1>
                <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold">Super Admin View</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-2xl font-semibold mb-6">Financial Consolidation</h2>
                    <div className="space-y-4 text-slate-600">
                        <p className="flex justify-between border-b pb-2"><span>Total Network Revenue (YTD)</span> <span className="font-bold text-slate-900">$45,210,000</span></p>
                        <p className="flex justify-between border-b pb-2"><span>Campus A (Dubai)</span> <span>$12,400,000</span></p>
                        <p className="flex justify-between border-b pb-2"><span>Campus B (London)</span> <span>$18,100,000</span></p>
                        <p className="flex justify-between pb-2"><span>Campus C (Mumbai)</span> <span>$14,710,000</span></p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-2xl font-semibold mb-6">Group Policy Deployment</h2>
                    <p className="text-slate-500 mb-6">Push global curriculum updates, fee structures, and uniform policies across all 14 regions instantly.</p>
                    <button className="w-full py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors">
                        Deploy Policy Update
                    </button>
                </div>
            </div>
        </div>
    );
}
