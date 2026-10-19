import { getCompanyDetailsWithTenants } from '@/lib/actions/platform';
import Link from 'next/link';
import CompanySettingsForm from '@/components/platform/CompanySettingsForm';
import { ShieldAlert, Building2, Users } from 'lucide-react';

export default async function CompanyDetailsPage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params;
    const { company, tenants } = await getCompanyDetailsWithTenants(id);

    if (!company) {
        return (
            <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground">
                Company node not found.
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            <div className="mb-6">
                <Link href="/platform/tenants" className="text-sm text-primary hover:underline font-medium mb-4 flex items-center">
                    ← Back to Provider Directory
                </Link>
                <div className="flex justify-between items-end mt-4">
                    <div>
                        <h1 className="text-4xl font-extrabold text-foreground tracking-tight">{company.name}</h1>
                        <p className="text-muted-foreground mt-2 text-lg">System ID: <code className="text-sm bg-muted px-2 py-0.5 rounded">{company.id}</code></p>
                    </div>
                    <div className={`px-4 py-2 rounded-xl border ${company.isActive ? 'bg-success-subtle border-success/30 text-success-subtle-foreground' : 'bg-destructive-subtle border-destructive/30 text-destructive-subtle-foreground'} font-bold flex items-center gap-2`}>
                        <span className={`w-2 h-2 rounded-full ${company.isActive ? 'bg-success animate-pulse' : 'bg-destructive'}`}></span>
                        {company.isActive ? 'ACTIVE NODE' : 'LOCKED'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Quick Stats & Tenants */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Attached Tenants</h3>
                        <div className="space-y-4">
                            {tenants.map(t => (
                                <div key={t.id} className="p-4 rounded-xl border border-border bg-muted flex justify-between items-center group hover:border-primary/40 transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground"><Building2 size={14} /></div>
                                        <div>
                                            <p className="font-bold text-foreground text-sm group-hover:text-primary transition">{t.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono mt-0.5">Code: {t.code}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {tenants.length === 0 && <p className="text-sm text-muted-foreground italic">No tenants provisioned yet.</p>}
                        </div>
                    </div>

                    <div className="bg-primary rounded-3xl border border-primary/80 shadow-lg p-6 text-primary-foreground relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4"><ShieldAlert size={120} /></div>
                        <h3 className="text-xs font-bold text-primary-foreground/80 uppercase tracking-widest mb-4 relative z-10">Stripe Billing Context</h3>
                        <div className="relative z-10 space-y-4">
                            <div>
                                <p className="text-primary-foreground/80 text-sm mb-1">Customer ID</p>
                                <p className="font-mono text-sm bg-black/20 p-2 rounded-lg break-all border border-white/20">{company.stripeCustomerId || 'Not Linked'}</p>
                            </div>
                            <div>
                                <p className="text-primary-foreground/80 text-sm mb-1">Status</p>
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
