'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTenantAction } from '@/lib/actions/platform';

export default function NewTenantPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{code: string} | null>(null);
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
            setSuccess({ code: result.code });
            // Allow them to see the success message before redirecting back
            setTimeout(() => {
                router.push('/platform/tenants');
            }, 3000);
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="mb-6">
                <button onClick={() => router.back()} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-4 flex items-center">
                    ← Back to Tenants
                </button>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Onboard New School</h1>
                <p className="text-slate-500 mt-1">Provision a completely isolated multi-tenant database enclave.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                {success ? (
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl mb-3">✓</div>
                        <h3 className="text-emerald-800 font-bold text-lg">Tenant Provisioned Successfully!</h3>
                        <p className="text-emerald-700 mt-1">Their unique school code is: <strong className="font-mono bg-emerald-200 px-2 py-0.5 rounded">{success.code}</strong></p>
                        <p className="text-sm text-emerald-600 mt-2">Default Admin Password: <code>password</code></p>
                        <p className="text-xs text-emerald-500 mt-4">Redirecting...</p>
                    </div>
                ) : (
                    <form action={handleSubmit} className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">School Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Registered School Name</label>
                                    <input type="text" name="name" required className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" placeholder="e.g. Delhi Public School" />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">Inaugural Administrator Setup</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                                    <input type="text" name="adminFirstName" required className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" placeholder="Admin First Name" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                    <input type="text" name="adminLastName" required className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" placeholder="Admin Last Name" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin Email Address</label>
                                    <input type="email" name="adminEmail" required className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" placeholder="admin@school.com" />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-100">
                            <button type="submit" disabled={loading} className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition shadow-md shadow-indigo-200 disabled:opacity-70 flex justify-center items-center">
                                {loading ? 'Provisioning New Tenant...' : 'Initialize Tenant'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
