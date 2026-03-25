export default function StripeBillingPage() {
    const invoices = [
        { id: 'INV-001', school: 'Greenwood High International', amount: 8500, status: 'PAID', date: '2026-03-01', tier: 'ENTERPRISE' },
        { id: 'INV-002', school: 'St. Marys Academy', amount: 2400, status: 'PAID', date: '2026-03-01', tier: 'AI_PRO' },
        { id: 'INV-003', school: 'Delhi Public School (North)', amount: 14500, status: 'PAID', date: '2026-03-01', tier: 'ENTERPRISE' },
        { id: 'INV-004', school: 'Oakridge International', amount: 1200, status: 'PAST_DUE', date: '2026-02-01', tier: 'CORE' },
        { id: 'INV-005', school: 'Ryan International', amount: 4800, status: 'PAID', date: '2026-03-01', tier: 'AI_PRO' },
    ];

    const totalMRR = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
    const pastDue = invoices.filter(i => i.status === 'PAST_DUE');

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Stripe Billing</h1>
                <p className="text-slate-500 mt-1">Manage subscriptions, invoices, and payment methods across all tenants.</p>
            </div>

            {/* Revenue Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Monthly Recurring Revenue</p>
                    <span className="text-4xl font-bold text-slate-900">${totalMRR.toLocaleString()}</span>
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
