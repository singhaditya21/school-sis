'use client';

import { useState } from 'react';
import { createGroupPolicyAction, deleteGroupPolicyAction } from '@/lib/actions/hq';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Trash2, Plus, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PolicyClient({ initialPolicies, groupId }: { initialPolicies: any[], groupId: string }) {
    const [policies, setPolicies] = useState(initialPolicies);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const [form, setForm] = useState({
        policyName: '',
        policyKey: '',
        policyValue: '',
        isHardBlock: true,
        documentUrl: ''
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const newPolicy = await createGroupPolicyAction({
                groupId,
                ...form
            });
            setPolicies([newPolicy, ...policies]);
            setForm({ policyName: '', policyKey: '', policyValue: '', isHardBlock: true, documentUrl: '' });
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to create policy');
        }
        setIsSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this policy? Campuses will no longer be restricted by it.')) return;
        
        try {
            await deleteGroupPolicyAction(id);
            setPolicies(policies.filter(p => p.id !== id));
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to delete policy');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                {policies.length === 0 ? (
                    <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/50 text-center text-slate-400">
                        No policies defined. Campuses currently have full autonomy.
                    </div>
                ) : (
                    policies.map(policy => (
                        <Card key={policy.id} className="bg-slate-950 border-slate-800 text-slate-200">
                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                <div>
                                    <CardTitle className="text-lg text-white flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-indigo-400" />
                                        {policy.policyName}
                                    </CardTitle>
                                    <p className="text-xs text-slate-500 font-mono mt-1">KEY: {policy.policyKey}</p>
                                </div>
                                <button 
                                    onClick={() => handleDelete(policy.id)}
                                    className="text-slate-500 hover:text-rose-400 transition-colors p-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Enforced Value</p>
                                        <p className="font-semibold text-emerald-400">{policy.policyValue}</p>
                                    </div>
                                    <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Hard Block</p>
                                        <p className="font-semibold text-amber-400 flex items-center gap-1">
                                            {policy.isHardBlock ? (
                                                <><ShieldAlert className="w-4 h-4"/> Prevent Overrides</>
                                            ) : 'Soft Warning Only'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <div>
                <Card className="bg-slate-950 border-slate-800 sticky top-6">
                    <CardHeader>
                        <CardTitle className="text-white text-lg">Define New Policy</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4 text-sm text-slate-300">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Policy Name</label>
                                <input 
                                    required
                                    type="text" 
                                    value={form.policyName}
                                    onChange={e => setForm({...form, policyName: e.target.value})}
                                    placeholder="e.g. Minimum Attendance Requirement"
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Policy Key (Internal)</label>
                                <input 
                                    required
                                    type="text" 
                                    value={form.policyKey}
                                    onChange={e => setForm({...form, policyKey: e.target.value})}
                                    placeholder="e.g. MIN_ATTENDANCE_PCT"
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 font-mono text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Enforced Value</label>
                                <input 
                                    required
                                    type="text" 
                                    value={form.policyValue}
                                    onChange={e => setForm({...form, policyValue: e.target.value})}
                                    placeholder="e.g. 75"
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer mt-4">
                                <input 
                                    type="checkbox" 
                                    checked={form.isHardBlock}
                                    onChange={e => setForm({...form, isHardBlock: e.target.checked})}
                                    className="rounded border-slate-800 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                                />
                                <span>Hard Block (Prevent local overrides)</span>
                            </label>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" />
                                {isSubmitting ? 'Deploying...' : 'Deploy Policy'}
                            </button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
