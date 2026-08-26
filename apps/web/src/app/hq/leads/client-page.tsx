'use client';

import React, { useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Target, Users, Mail, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { updateLeadStatusAction } from './actions';

export interface StatusAggregate {
    status: string;
    count: number;
    capacity: number;
}

export interface Lead {
    id: string;
    contactName: string;
    contactEmail: string;
    schoolName: string;
    studentCapacity: number;
    painPoints: string | null;
    status: string;
    createdAt: string | Date;
}

const STAGES = [
    { key: 'NEW', label: 'New', color: '#3b82f6' },
    { key: 'CONTACTED', label: 'Contacted', color: '#f59e0b' },
    { key: 'CLOSED', label: 'Closed', color: '#10b981' },
];

function statusClasses(status: string) {
    if (status === 'NEW') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (status === 'CONTACTED') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (status === 'CLOSED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    return 'bg-slate-800 text-slate-400 border-slate-700';
}

export default function LeadsClient({
    statusData,
    leads,
}: {
    statusData: StatusAggregate[];
    leads: Lead[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const funnelData = useMemo(
        () => STAGES.map((stage) => ({
            name: stage.label,
            color: stage.color,
            value: Number(statusData.find((s) => s.status === stage.key)?.count ?? 0),
        })),
        [statusData],
    );

    const totals = useMemo(
        () => statusData.reduce(
            (acc, s) => ({
                leads: acc.leads + Number(s.count),
                capacity: acc.capacity + Number(s.capacity),
            }),
            { leads: 0, capacity: 0 },
        ),
        [statusData],
    );

    const openCapacity = useMemo(
        () => statusData
            .filter((s) => s.status !== 'CLOSED')
            .reduce((sum, s) => sum + Number(s.capacity), 0),
        [statusData],
    );

    const setStatus = (lead: Lead, status: string) => {
        startTransition(async () => {
            const result = await updateLeadStatusAction({ leadId: lead.id, status });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the lead.');
                return;
            }
            toast.success(`${lead.schoolName} moved to ${status}.`);
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Lead Pipeline</h1>
                <p className="text-sm text-slate-400 mt-1">Inbound schools captured from the marketing site.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat
                    label="Open leads"
                    value={String(totals.leads - Number(statusData.find((s) => s.status === 'CLOSED')?.count ?? 0))}
                    hint={`${totals.leads} captured in total`}
                    icon={<Target className="w-5 h-5 text-indigo-400" />}
                />
                <Stat
                    label="Open seat capacity"
                    value={openCapacity.toLocaleString('en-IN')}
                    hint="Students across leads not yet closed"
                    icon={<Users className="w-5 h-5 text-cyan-400" />}
                />
                <Stat
                    label="Closed"
                    value={String(Number(statusData.find((s) => s.status === 'CLOSED')?.count ?? 0))}
                    hint="Marked won or lost"
                    icon={<Target className="w-5 h-5 text-emerald-400" />}
                />
            </div>

            <p className="text-xs text-slate-500">
                Leads record the seat capacity a school reports, not a contract value — deal amounts are not captured, so no
                pipeline revenue is shown.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-6">Leads by stage</h3>
                <div className="h-64">
                    {totals.leads > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                                <XAxis type="number" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                                    cursor={{ fill: '#1e293b' }}
                                />
                                <Bar dataKey="value" barSize={32} radius={[0, 4, 4, 0]}>
                                    {funnelData.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <span className="text-sm text-slate-500">No leads captured yet.</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Prospects</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Received</th>
                                <th className="px-6 py-4 font-semibold">School</th>
                                <th className="px-6 py-4 font-semibold">Contact</th>
                                <th className="px-6 py-4 font-semibold text-right">Seats</th>
                                <th className="px-6 py-4 font-semibold">Stage</th>
                                <th className="px-6 py-4 font-semibold text-right">Move to</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {leads.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        No inbound leads yet.
                                    </td>
                                </tr>
                            )}
                            {leads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-slate-900/50 transition-colors align-top">
                                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                                        {format(new Date(lead.createdAt), 'd MMM yyyy')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-white">{lead.schoolName}</p>
                                        {lead.painPoints && (
                                            <p className="text-xs text-slate-500 mt-1 max-w-sm">{lead.painPoints}</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        <span className="flex items-center gap-2 text-slate-300">
                                            <Mail className="w-3 h-3 text-slate-500" />
                                            {lead.contactEmail}
                                        </span>
                                        <span className="block text-slate-500 mt-1">{lead.contactName}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right tabular-nums">
                                        {lead.studentCapacity.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1.5 rounded-md text-xs font-medium tracking-wide border ${statusClasses(lead.status)}`}>
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2 flex-wrap">
                                            {STAGES.filter((s) => s.key !== lead.status).map((stage) => (
                                                <button
                                                    key={stage.key}
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() => setStatus(lead, stage.key)}
                                                    className="text-xs font-medium text-slate-300 border border-slate-700 rounded-md px-2.5 py-1.5 hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    {stage.label}
                                                </button>
                                            ))}
                                            <Link
                                                href="/platform/tenants/new"
                                                title="Provision a campus for this school"
                                                className="p-1.5 text-slate-400 hover:text-indigo-400 transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Stat({
    label, value, hint, icon,
}: {
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-400 mb-1">{label}</p>
                    <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{hint}</p>
                </div>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
}
