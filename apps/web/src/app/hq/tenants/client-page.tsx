'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PlatformTenant, PlatformStats } from '@/lib/actions/platform';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Building2, Users, AlertTriangle, PlayCircle, Ban, Undo2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { startImpersonationAction, suspendCampusAction } from './actions';

const TIERS = ['CORE', 'AI_PRO', 'ENTERPRISE'] as const;
const COLORS = ['#818cf8', '#34d399', '#f472b6'];

export default function TenantsClient({
    initialTenants,
    stats,
}: {
    initialTenants: PlatformTenant[];
    stats: PlatformStats;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [confirmingSuspend, setConfirmingSuspend] = useState<string | null>(null);

    const tierData = useMemo(
        () => TIERS.map((tier) => ({
            name: tier,
            value: initialTenants.filter((t) => t.subscriptionTier === tier).length,
        })),
        [initialTenants],
    );

    const collectedByTier = useMemo(
        () => TIERS.map((tier) => ({
            name: tier,
            collected: initialTenants
                .filter((t) => t.subscriptionTier === tier)
                .reduce((sum, t) => sum + t.revenue, 0),
        })),
        [initialTenants],
    );

    const handleImpersonate = (tenant: PlatformTenant) => {
        startTransition(async () => {
            const result = await startImpersonationAction(tenant.id);
            if (!result.success) {
                toast.error(result.error ?? 'Could not start the support session.');
                return;
            }
            toast.success(`Signed in to ${tenant.name} as its administrator.`);
            router.push(result.redirectTo ?? '/dashboard');
        });
    };

    const handleToggleStatus = (tenant: PlatformTenant, nextActive: boolean) => {
        startTransition(async () => {
            const result = await suspendCampusAction({ tenantId: tenant.id, isActive: nextActive });
            if (!result.success) {
                toast.error(result.error ?? 'Could not change the campus status.');
                return;
            }
            setConfirmingSuspend(null);
            toast.success(nextActive ? `${tenant.name} reactivated.` : `${tenant.name} suspended.`);
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Campus Management</h1>
                <p className="text-sm text-slate-400 mt-1">
                    Every campus tenant on the platform, with its subscription tier and fee collection to date.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    label="Campuses"
                    value={String(stats.totalSchools)}
                    hint="Active tenants"
                    icon={<Building2 className="w-5 h-5 text-indigo-400" />}
                />
                <StatCard
                    label="Active students"
                    value={stats.totalActiveStudents.toLocaleString('en-IN')}
                    hint="Across all campuses"
                    icon={<Users className="w-5 h-5 text-emerald-400" />}
                />
                <StatCard
                    label="Fees collected"
                    value={formatCurrency(initialTenants.reduce((sum, t) => sum + t.revenue, 0))}
                    hint="Completed payments, all campuses"
                    icon={<Users className="w-5 h-5 text-cyan-400" />}
                />
                <StatCard
                    label="Churn risk"
                    value={String(stats.churnRiskSchools)}
                    hint="CORE tier, no payment in 90 days"
                    tone="rose"
                    icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-6">Campuses by subscription tier</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={tierData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                                    {tierData.map((entry, index) => (
                                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                        {tierData.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                                <span className="text-xs text-slate-400">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-1">Fees collected by tier</h3>
                    <p className="text-xs text-slate-500 mb-6">Completed campus fee payments, in rupees.</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={collectedByTier}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis
                                    stroke="#475569"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    width={90}
                                    tickFormatter={(val: number) => formatCurrency(val)}
                                />
                                <RechartsTooltip
                                    formatter={(val: number) => [formatCurrency(val), 'Collected']}
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    cursor={{ fill: '#1e293b' }}
                                />
                                <Bar dataKey="collected" radius={[4, 4, 0, 0]}>
                                    {collectedByTier.map((entry, index) => (
                                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Campus roster</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Campus</th>
                                <th className="px-6 py-4 font-semibold">Tier</th>
                                <th className="px-6 py-4 font-semibold text-right">Active students</th>
                                <th className="px-6 py-4 font-semibold text-right">Fees collected</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {initialTenants.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No campuses provisioned yet.</td>
                                </tr>
                            )}
                            {initialTenants.map((tenant) => {
                                const isActive = tenant.status === 'ACTIVE';
                                return (
                                    <tr key={tenant.id} className="hover:bg-slate-900/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-200">{tenant.name}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">{tenant.code} · {tenant.adminEmail}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                tenant.subscriptionTier === 'ENTERPRISE' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                                tenant.subscriptionTier === 'AI_PRO' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                                                'bg-slate-800 text-slate-400 border border-slate-700'
                                            }`}>
                                                {tenant.subscriptionTier}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums">{tenant.activeStudents.toLocaleString('en-IN')}</td>
                                        <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{formatCurrency(tenant.revenue)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                                                <span className="text-xs font-medium text-slate-400">{tenant.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                {confirmingSuspend === tenant.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={isPending}
                                                            onClick={() => handleToggleStatus(tenant, false)}
                                                            className="text-xs font-medium text-red-400 border border-red-900/60 rounded-md px-2.5 py-1.5 hover:bg-red-950/40 disabled:opacity-50"
                                                        >
                                                            Confirm suspend
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmingSuspend(null)}
                                                            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            title="Sign in to this campus as its administrator"
                                                            disabled={isPending || !isActive}
                                                            onClick={() => handleImpersonate(tenant)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                                        >
                                                            <PlayCircle className="w-4 h-4" />
                                                        </button>
                                                        {isActive ? (
                                                            <button
                                                                type="button"
                                                                title="Suspend this campus"
                                                                disabled={isPending}
                                                                onClick={() => setConfirmingSuspend(tenant.id)}
                                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-40"
                                                            >
                                                                <Ban className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                title="Reactivate this campus"
                                                                disabled={isPending}
                                                                onClick={() => handleToggleStatus(tenant, true)}
                                                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors disabled:opacity-40"
                                                            >
                                                                <Undo2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    label, value, hint, icon, tone,
}: {
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone?: 'rose';
}) {
    return (
        <div className={`p-5 rounded-xl border ${tone === 'rose' ? 'border-red-900/50 bg-red-950/10' : 'border-slate-800 bg-slate-950'}`}>
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <p className={`text-sm font-medium mb-1 ${tone === 'rose' ? 'text-red-400' : 'text-slate-400'}`}>{label}</p>
                    <p className={`text-2xl font-bold tabular-nums ${tone === 'rose' ? 'text-red-500' : 'text-white'}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{hint}</p>
                </div>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
}
