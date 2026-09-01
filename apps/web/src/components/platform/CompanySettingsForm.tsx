'use client';

import { useState } from 'react';
import { updateCompanySettingsAction } from '@/lib/actions/platform';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function CompanySettingsForm({
    company,
}: {
    company: any;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [tier, setTier] = useState(company.subscriptionTier || 'CORE');
    const [isActive, setIsActive] = useState(company.isActive);
    const [themeColor, setThemeColor] = useState(company.themeColor || '#4F46E5');
    const [domainMask, setDomainMask] = useState(company.domainMask || '');
    
    // Default active modules logic
    const allModules = [
        { id: 'FEES', label: 'Billing & Fees', default: true },
        { id: 'ATTENDANCE', label: 'Attendance Tracking', default: true },
        { id: 'TRANSPORT', label: 'Transport Logic', default: true },
        { id: 'HR', label: 'HR & Payroll', default: true },
        { id: 'MULTI_CAMPUS', label: 'Multi-Campus Node', default: false },
        { id: 'AI_AGENTS', label: 'ScholarMind AI Agents', default: false },
        { id: 'HIGHER_ED', label: 'Higher Education Suite', default: false },
        { id: 'INTERNATIONAL', label: 'International Visas', default: false },
        { id: 'COACHING', label: 'Coaching Packages', default: false }
    ];

    const currentModules = company.activeModules || [];
    
    const [activeModules, setActiveModules] = useState<string[]>(
        currentModules.length > 0 
            ? currentModules 
            : allModules.filter(m => m.default).map(m => m.id)
    );

    const toggleModule = (moduleId: string) => {
        if (activeModules.includes(moduleId)) {
            setActiveModules(activeModules.filter(m => m !== moduleId));
        } else {
            setActiveModules([...activeModules, moduleId]);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await updateCompanySettingsAction(company.id, {
                subscriptionTier: tier as 'CORE' | 'AI_PRO' | 'ENTERPRISE',
                activeModules,
                isActive,
                themeColor,
                domainMask
            });
            toast.success('Company settings updated successfully.');
            router.refresh();
        } catch (e: unknown) {
            toast.error('Failed to update company context.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
            <div className="p-8 border-b border-border flex justify-between items-center bg-muted/50">
                <div>
                    <h3 className="text-xl font-bold text-foreground">Provisioning Toggles</h3>
                    <p className="text-sm text-muted-foreground mt-1">Override feature flags and tier settings manually.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-muted-foreground">Master Lock</span>
                    <button 
                        onClick={() => setIsActive(!isActive)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            <div className="p-8 space-y-8">
                <div>
                    <label className="block text-sm font-semibold text-foreground mb-3">Subscription Tier</label>
                    <div className="flex gap-4">
                        {['CORE', 'AI_PRO', 'ENTERPRISE'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTier(t)}
                                className={`px-6 py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                                    tier === t 
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' 
                                    : 'border-border hover:border-border text-muted-foreground'
                                }`}
                            >
                                {t.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">Changing tiers here ignores Stripe checkout dependencies and forces an unlock.</p>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-foreground mb-4">Active Application Modules</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {allModules.map(module => {
                            const active = activeModules.includes(module.id);
                            return (
                                <button
                                    key={module.id}
                                    onClick={() => toggleModule(module.id)}
                                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                                        active 
                                        ? 'border-emerald-500 bg-emerald-50' 
                                        : 'border-border bg-card hover:border-border'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                                        active ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-card border-border'
                                    }`}>
                                        {active && <span className="text-xs">✓</span>}
                                    </div>
                                    <span className={`text-sm font-bold ${active ? 'text-emerald-900' : 'text-muted-foreground'}`}>
                                        {module.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-muted p-6 rounded-2xl border border-border space-y-6">
                    <h4 className="font-bold text-foreground text-sm uppercase tracking-widest border-b border-border pb-3 mb-4">White Label Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-foreground mb-2">Custom Domain Mask</label>
                            <input 
                                type="text"
                                value={domainMask}
                                onChange={e => setDomainMask(e.target.value)}
                                placeholder="portal.clientdomain.com"
                                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-muted-foreground mt-2">Requires CNAME redirect to edge.scholarmind.app</p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-foreground mb-2">Primary HEX Theme Color</label>
                            <div className="flex gap-3">
                                <input 
                                    type="color"
                                    value={themeColor}
                                    onChange={e => setThemeColor(e.target.value)}
                                    className="w-12 h-10 p-1 border border-border rounded-lg cursor-pointer"
                                />
                                <input 
                                    type="text"
                                    value={themeColor}
                                    onChange={e => setThemeColor(e.target.value)}
                                    className="flex-1 px-4 py-2 border border-border rounded-lg uppercase"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-border flex justify-end">
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition"
                    >
                        {loading ? 'Committing via Edge...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}
