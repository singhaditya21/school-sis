'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTenantAction } from '@/lib/actions/platform';

export default function NewTenantPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{code: string; temporaryPassword: string} | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const result = await createTenantAction(formData);

        if (result?.error) {
            setError(result.error);
            setLoading(false);
        } else if (result?.success) {
            setSuccess({ code: result.code, temporaryPassword: result.temporaryPassword });
            // Allow them to see the success message before redirecting back
            setTimeout(() => {
                router.push('/platform/tenants');
            }, 10000);
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="mb-6">
                <button onClick={() => router.back()} className="text-sm text-primary hover:underline font-medium mb-4 flex items-center">
                    ← Back to Tenants
                </button>
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Onboard New School</h1>
                <p className="text-muted-foreground mt-1">Provision a completely isolated multi-tenant database enclave.</p>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
                {success ? (
                    <div className="p-6 bg-success-subtle border border-success/30 rounded-xl text-center">
                        <div className="w-12 h-12 bg-success text-success-foreground rounded-full flex items-center justify-center mx-auto text-xl mb-3">✓</div>
                        <h3 className="text-success-subtle-foreground font-bold text-lg">Tenant Provisioned Successfully!</h3>
                        <p className="text-success-subtle-foreground mt-1">Their unique school code is: <strong className="font-mono bg-success/20 px-2 py-0.5 rounded">{success.code}</strong></p>
                        <p className="text-sm text-success-subtle-foreground mt-2">Temporary Admin Password: <code>{success.temporaryPassword}</code></p>
                        <p className="text-xs text-success-subtle-foreground/80 mt-1">Share it once through a secure channel and require reset after first login.</p>
                        <p className="text-xs text-muted-foreground mt-4">Redirecting...</p>
                    </div>
                ) : (
                    <form action={handleSubmit} className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">School Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Registered School Name</label>
                                    <input type="text" name="name" required className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary outline-none transition" placeholder="e.g. Delhi Public School" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Cluster Database Region</label>
                                    <select name="region" className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary outline-none transition">
                                        <option value="US-EAST">Northeast USA (us-east-1)</option>
                                        <option value="US-WEST">Western USA (us-west-1)</option>
                                        <option value="EU-CENTRAL">European Union (eu-central-1)</option>
                                        <option value="AP-SOUTH">India & South Asia (ap-south-1)</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground mt-1">Databases will be spun up in this cloud region to guarantee local privacy compliance.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">Inaugural Administrator Setup</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">First Name</label>
                                    <input type="text" name="adminFirstName" required className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary outline-none transition" placeholder="Admin First Name" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Last Name</label>
                                    <input type="text" name="adminLastName" required className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary outline-none transition" placeholder="Admin Last Name" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-foreground mb-1">Admin Email Address</label>
                                    <input type="email" name="adminEmail" required className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary outline-none transition" placeholder="admin@school.com" />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-destructive-subtle text-destructive-subtle-foreground rounded-xl border border-destructive/30 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="pt-4 border-t border-border">
                            <button type="submit" disabled={loading} className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition shadow-md disabled:opacity-70 flex justify-center items-center">
                                {loading ? 'Provisioning New Tenant...' : 'Initialize Tenant'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
