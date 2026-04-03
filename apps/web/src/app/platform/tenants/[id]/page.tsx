import { getCompanyDetailsWithTenants } from '@/lib/actions/platform';
import Link from 'next/link';
import CompanySettingsForm from '@/components/platform/CompanySettingsForm';
import { ShieldAlert, Building2, Users } from 'lucide-react';

export default async function CompanyDetailsPage({
    params
}: {
    params: { id: string }
}) {
    const { company, tenants } = await getCompanyDetailsWithTenants(params.id);

    if (!company) {
        return (
            <div className="max-w-4xl mx-auto py-12 text-center text-slate-500">
                Company node not found.
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            <div className="mb-6">
                <Link href="/platform/tenants" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-4 flex items-center">
                    ← Back to Provider Directory
                </Link>
                <div className="flex justify-between items-end mt-4">
                    <div>
                        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{company.name}</h1>
                        <p className="text-slate-500 mt-2 text-lg">System ID: <code className="text-sm bg-slate-100 px-2 py-0.5 rounded">{company.id}</code></p>
                    </div>
                    <div className={`px-4 py-2 rounded-xl border ${company.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'} font-bold flex items-center gap-2`}>
                        <span className={`w-2 h-2 rounded-full ${company.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                        {company.isActive ? 'ACTIVE NODE' : 'LOCKED'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Quick Stats & Tenants */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Attached Tenants</h3>
                        <div className="space-y-4">
                            {tenants.map(t => (
                                <div key={t.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex justify-between items-center group hover:border-indigo-200 transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500"><Building2 size={14} /></div>
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition">{t.name}</p>
                                            <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {t.code}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {tenants.length === 0 && <p className="text-sm text-slate-500 italic">No tenants provisioned yet.</p>}
                        </div>
                    </div>

                    <div className="bg-indigo-600 rounded-3xl border border-indigo-500 shadow-lg shadow-indigo-600/20 p-6 text-white relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4"><ShieldAlert size={120} /></div>
                        <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-4 relative z-10">Stripe Billing Context</h3>
                        <div className="relative z-10 space-y-4">
                            <div>
                                <p className="text-indigo-200 text-sm mb-1">Customer ID</p>
                                <p className="font-mono text-sm bg-indigo-700/50 p-2 rounded-lg break-all border border-indigo-500/50">{company.stripeCustomerId || 'Not Linked'}</p>
                            </div>
                            <div>
                                <p className="text-indigo-200 text-sm mb-1">Status</p>
                                <p className="font-bold">{company.billingStatus || 'UNKNOWN'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Deep Config Form */}
                <div className="lg:col-span-2">
                    <CompanySettingsForm company={company} />
                </div>
            </div>
        </div>
    );
}
