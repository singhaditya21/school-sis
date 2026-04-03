import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { setTenantContext } from '@/lib/db';
import { companies, tenants } from '@/lib/db/schema';
import { eq, sql, count } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getComplianceData() {
    await setTenantContext('platform');

    const result = await db.execute(sql`
        SELECT
            c.id,
            c.name,
            c.subscription_tier as tier,
            c.region,
            c.is_active,
            (SELECT COUNT(*)::int FROM tenants t WHERE t.company_id = c.id) as tenant_count,
            CASE
                WHEN c.stripe_customer_id IS NOT NULL AND c.stripe_subscription_id IS NOT NULL THEN 'VERIFIED'
                WHEN c.stripe_customer_id IS NOT NULL THEN 'PARTIAL'
                ELSE 'UNVERIFIED'
            END as billing_compliance,
            CASE
                WHEN c.domain_mask IS NOT NULL THEN true
                ELSE false
            END as has_branding
        FROM companies c
        WHERE c.is_active = true
        ORDER BY c.name
    `);
    return result as any[];
}

export default async function CompliancePage() {
    const session = await getSession();
    if (!session.isLoggedIn || session.role !== 'PLATFORM_ADMIN') redirect('/unauthorized');

    const data = await getComplianceData();

    const verified = data.filter(d => d.billing_compliance === 'VERIFIED').length;
    const partial = data.filter(d => d.billing_compliance === 'PARTIAL').length;
    const unverified = data.filter(d => d.billing_compliance === 'UNVERIFIED').length;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Global Compliance Matrix</h1>
                <p className="text-slate-400 mt-1">Billing verification status and regional sovereignty mapping for all active companies.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-emerald-950/30 border-emerald-900/50 text-emerald-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-400">Billing Verified</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{verified}</div></CardContent>
                </Card>
                <Card className="bg-amber-950/30 border-amber-900/50 text-amber-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-400">Partially Verified</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{partial}</div></CardContent>
                </Card>
                <Card className="bg-rose-950/30 border-rose-900/50 text-rose-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-rose-400">Unverified</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{unverified}</div></CardContent>
                </Card>
            </div>

            <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                <CardHeader><CardTitle>Company Compliance Detail</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 border-y border-slate-700 text-xs text-slate-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Company</th>
                                    <th className="px-6 py-4">Region</th>
                                    <th className="px-6 py-4">Tier</th>
                                    <th className="px-6 py-4">Campuses</th>
                                    <th className="px-6 py-4">Billing Status</th>
                                    <th className="px-6 py-4">Branding</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {data.length === 0 && (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No companies found.</td></tr>
                                )}
                                {data.map((c: any) => (
                                    <tr key={c.id} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-white">{c.name}</td>
                                        <td className="px-6 py-4 text-slate-400">{c.region}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                c.tier === 'ENTERPRISE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                c.tier === 'AI_PRO' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>{c.tier}</span>
                                        </td>
                                        <td className="px-6 py-4 font-mono">{c.tenant_count}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                c.billing_compliance === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                c.billing_compliance === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                            }`}>{c.billing_compliance}</span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400">{c.has_branding ? '✓ Custom' : '—'}</td>
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
