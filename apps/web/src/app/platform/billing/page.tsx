import { getPlatformBillingStats } from '@/lib/actions/platform';

export default async function StripeBillingPage() {
    const invoices = await getPlatformBillingStats();

    const totalMRR = invoices.filter(i => i.status === 'PAID' || i.status === 'ACTIVE').reduce((s, i) => s + i.amount, 0);
    const pastDue = invoices.filter(i => i.status === 'PAST_DUE' || i.status === 'UNPAID');

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Platform Billing</h1>
                <p className="text-slate-500 mt-1">Manage subscriptions, platform revenue, and tier assignments across all entities.</p>
            </div>

            {/* Revenue Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-50 rounded-bl-[100px] z-0"></div>
                    <div className="relative z-10">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Platform MRR (Est)</p>
                        <span className="text-4xl font-bold text-slate-900">${totalMRR.toLocaleString()}</span>
                    </div>
                </div>
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-2">Paid This Month</p>
                    <span className="text-4xl font-bold text-emerald-700">{invoices.filter(i => i.status === 'PAID').length}</span>
                    <span className="text-lg text-emerald-600 ml-2">invoices</span>
                </div>
                <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 shadow-sm">
                    <p className="text-sm font-semibold text-rose-500 uppercase tracking-wider mb-2">Past Due</p>
                    <span className="text-4xl font-bold text-rose-700">{pastDue.length}</span>
                    <span className="text-lg text-rose-500 ml-2">outstanding</span>
                </div>
            </div>

            {/* Invoice Table */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-5">Recent Invoices</h2>
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">Invoice</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">School</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">Tier</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase text-right">Amount</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase">Date</th>
                                <th className="p-5 text-sm font-semibold text-slate-600 uppercase text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {invoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-5 font-mono text-sm text-indigo-600 font-medium">{inv.id}</td>
                                    <td className="p-5 font-medium text-slate-900">{inv.school}</td>
                                    <td className="p-5">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            inv.tier === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700' :
                                            inv.tier === 'AI_PRO' ? 'bg-indigo-100 text-indigo-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>{inv.tier}</span>
                                    </td>
                                    <td className="p-5 text-right font-medium text-slate-900">${inv.amount.toLocaleString()}</td>
                                    <td className="p-5 text-slate-500">{inv.date}</td>
                                    <td className="p-5 text-center">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                        }`}>{inv.status}</span>
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
