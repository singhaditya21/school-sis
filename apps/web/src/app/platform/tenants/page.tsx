import { getAllPlatformTenants, toggleTenantStatusAction, impersonateTenantAction } from '@/lib/actions/platform';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function TenantSchoolsPage() {
    const tenants = await getAllPlatformTenants();

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tenant Schools</h1>
                    <p className="text-slate-500 mt-1">Manage all registered school instances on the platform.</p>
                </div>
                <Link href="/platform/tenants/new" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition shadow-md shadow-indigo-200">
                    + Onboard New School
                </Link>
            </div>

            {/* Tenant Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tenants.map(tenant => (
                    <div key={tenant.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{tenant.name}</h3>
                                <p className="text-sm text-slate-500">{tenant.adminEmail}</p>
                            </div>
                            <span className={`inline-block w-3 h-3 rounded-full mt-2 ${tenant.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`}></span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-5">
                            <div className="bg-slate-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-slate-900">{tenant.activeStudents.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">Students</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-slate-900">${tenant.revenue.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">ARR</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3 text-center">
                                <span className={`inline-block px-3 py-1 text-xs font-bold rounded-full ${
                                    tenant.subscriptionTier === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700' :
                                    tenant.subscriptionTier === 'AI_PRO' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-slate-100 text-slate-700'
                                }`}>{tenant.subscriptionTier}</span>
                                <p className="text-xs text-slate-500 mt-1">Tier</p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <form className="flex-1" action={async () => {
                                'use server';
                                await impersonateTenantAction(tenant.id);
                                redirect('/dashboard');
                            }}>
                                <button className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition">
                                    View Dashboard
                                </button>
                            </form>
                            
                            <Link href={`/platform/tenants/${tenant.companyId}`} className="flex-1 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 transition text-center flex items-center justify-center">
                                Manage Config
                            </Link>
                            
                            <form action={async () => {
                                'use server';
                                await toggleTenantStatusAction(tenant.id, tenant.status !== 'ACTIVE');
                            }}>
                                <button className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                                    tenant.status === 'ACTIVE' 
                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                }`}>
                                    {tenant.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                                </button>
                            </form>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
