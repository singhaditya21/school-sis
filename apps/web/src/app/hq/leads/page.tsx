import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { setTenantContext } from '@/lib/db';
import { marketingLeads } from '@/lib/db/schema/platform';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getLeads() {
    await setTenantContext('platform');
    return db.select().from(marketingLeads).orderBy(desc(marketingLeads.createdAt)).limit(100);
}

export default async function LeadsDashboardPage() {
    const session = await getSession();
    if (!session.isLoggedIn || session.role !== 'PLATFORM_ADMIN') redirect('/unauthorized');

    const leads = await getLeads();

    const newCount = leads.filter(l => l.status === 'NEW').length;
    const contactedCount = leads.filter(l => l.status === 'CONTACTED').length;
    const closedCount = leads.filter(l => l.status === 'CLOSED').length;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Lead Pipeline</h1>
                <p className="text-slate-400 mt-1">Inbound leads captured from the marketing website via the /api/leads bridge.</p>
            </div>

            {/* Funnel KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-950/30 border-blue-900/50 text-blue-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-400">New Leads</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{newCount}</div></CardContent>
                </Card>
                <Card className="bg-amber-950/30 border-amber-900/50 text-amber-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-400">Contacted</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{contactedCount}</div></CardContent>
                </Card>
                <Card className="bg-emerald-950/30 border-emerald-900/50 text-emerald-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-400">Closed / Won</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold">{closedCount}</div></CardContent>
                </Card>
            </div>

            {/* Leads Table */}
            <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                <CardHeader><CardTitle>All Captured Leads</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 border-y border-slate-700 text-xs text-slate-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Contact</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">School</th>
                                    <th className="px-6 py-4">Capacity</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {leads.length === 0 && (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No leads captured yet. Share the marketing site!</td></tr>
                                )}
                                {leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-white">{lead.contactName}</td>
                                        <td className="px-6 py-4 text-slate-400">{lead.contactEmail}</td>
                                        <td className="px-6 py-4 text-white">{lead.schoolName}</td>
                                        <td className="px-6 py-4 font-mono">{lead.studentCapacity.toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                lead.status === 'NEW' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                lead.status === 'CONTACTED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                                {lead.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">{new Date(lead.createdAt).toLocaleDateString()}</td>
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
