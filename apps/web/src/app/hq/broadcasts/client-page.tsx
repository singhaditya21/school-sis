'use client';

import React, { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Megaphone, Activity, Plus, X } from 'lucide-react';
import { createBroadcastAction, setBroadcastActiveAction } from './actions';

export interface BroadcastRow {
    id: string;
    title: string;
    message: string;
    type: string;
    targetTiers: string[] | null;
    isActive: boolean;
    expiresAt: string | Date | null;
    createdAt: string | Date;
    createdByEmail: string | null;
}

const TYPES = ['INFO', 'MAINTENANCE', 'WARNING', 'CRITICAL'];
const TIERS = ['CORE', 'AI_PRO', 'ENTERPRISE'];

function typeClasses(type: string) {
    if (type === 'CRITICAL') return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (type === 'WARNING') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (type === 'MAINTENANCE') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-slate-800 text-slate-400 border-slate-700';
}

export default function BroadcastsClient({ broadcasts }: { broadcasts: BroadcastRow[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [composerOpen, setComposerOpen] = useState(false);
    const [form, setForm] = useState({
        title: '',
        message: '',
        type: 'INFO',
        targetTiers: [] as string[],
        expiresAt: '',
    });

    const activeCount = broadcasts.filter((b) => b.isActive).length;

    const toggleTier = (tier: string) => {
        setForm((prev) => ({
            ...prev,
            targetTiers: prev.targetTiers.includes(tier)
                ? prev.targetTiers.filter((t) => t !== tier)
                : [...prev.targetTiers, tier],
        }));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const result = await createBroadcastAction(form);
            if (!result.success) {
                toast.error(result.error ?? 'Could not publish the broadcast.');
                return;
            }
            toast.success('Broadcast published to campuses.');
            setForm({ title: '', message: '', type: 'INFO', targetTiers: [], expiresAt: '' });
            setComposerOpen(false);
            router.refresh();
        });
    };

    const setActive = (broadcast: BroadcastRow, isActive: boolean) => {
        startTransition(async () => {
            const result = await setBroadcastActiveAction({ broadcastId: broadcast.id, isActive });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the broadcast.');
                return;
            }
            toast.success(isActive ? 'Broadcast reactivated.' : 'Broadcast archived.');
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Global Broadcasts</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Announcements shown to campus administrators, filtered by subscription tier.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setComposerOpen((open) => !open)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    {composerOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {composerOpen ? 'Close composer' : 'New broadcast'}
                </button>
            </div>

            {composerOpen && (
                <form onSubmit={submit} className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Title</label>
                            <input
                                required
                                type="text"
                                maxLength={255}
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="e.g. Scheduled maintenance on Sunday"
                                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Type</label>
                            <select
                                value={form.type}
                                onChange={(e) => setForm({ ...form, type: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            >
                                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Message</label>
                        <textarea
                            required
                            rows={3}
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                            placeholder="What campuses need to know."
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <span className="block text-xs text-slate-400 mb-2">Target tiers</span>
                            <div className="flex flex-wrap gap-2">
                                {TIERS.map((tier) => {
                                    const selected = form.targetTiers.includes(tier);
                                    return (
                                        <button
                                            key={tier}
                                            type="button"
                                            onClick={() => toggleTier(tier)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                                selected
                                                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                                                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {tier}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {form.targetTiers.length === 0 ? 'No tier selected — this reaches every campus.' : 'Only the selected tiers will see it.'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Expires (optional)</label>
                            <input
                                type="date"
                                value={form.expiresAt}
                                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                Expiry is recorded for reference. Archiving a broadcast is what actually stops it being shown.
                            </p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {isPending ? 'Publishing…' : 'Publish broadcast'}
                    </button>
                </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Live broadcasts</p>
                            <p className="text-3xl font-bold text-cyan-400">{activeCount}</p>
                            <p className="text-xs text-slate-500 mt-1">Currently shown to campuses</p>
                        </div>
                        <Activity className="w-5 h-5 text-cyan-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Published to date</p>
                            <p className="text-3xl font-bold text-white">{broadcasts.length}</p>
                            <p className="text-xs text-slate-500 mt-1">Most recent 50</p>
                        </div>
                        <Megaphone className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
            </div>

            <p className="text-xs text-slate-500">
                Delivery receipts are not recorded, so open and read rates are not available for these announcements.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Broadcast history</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Published</th>
                                <th className="px-6 py-4 font-semibold">Type</th>
                                <th className="px-6 py-4 font-semibold">Announcement</th>
                                <th className="px-6 py-4 font-semibold">Targets</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {broadcasts.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        No broadcasts published yet.
                                    </td>
                                </tr>
                            )}
                            {broadcasts.map((b) => {
                                const expired = b.expiresAt ? new Date(b.expiresAt) < new Date() : false;
                                return (
                                    <tr key={b.id} className="hover:bg-slate-900/50 transition-colors align-top">
                                        <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                                            {format(new Date(b.createdAt), 'yyyy-MM-dd HH:mm')}
                                            {b.createdByEmail && (
                                                <span className="block text-slate-600 mt-1">{b.createdByEmail}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold tracking-widest border ${typeClasses(b.type)}`}>
                                                {b.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 max-w-md">
                                            <p className="font-medium text-white">{b.title}</p>
                                            <p className="text-xs text-slate-400 mt-1">{b.message}</p>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400">
                                            {b.targetTiers && b.targetTiers.length > 0 ? b.targetTiers.join(', ') : 'All tiers'}
                                            {b.expiresAt && (
                                                <span className="block text-slate-600 mt-1">
                                                    Expires {format(new Date(b.expiresAt), 'd MMM yyyy')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {b.isActive ? (
                                                <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Live{expired ? ' (past expiry)' : ''}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 font-medium text-xs">Archived</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                disabled={isPending}
                                                onClick={() => setActive(b, !b.isActive)}
                                                className="text-xs font-medium text-slate-300 border border-slate-700 rounded-md px-2.5 py-1.5 hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {b.isActive ? 'Archive' : 'Reactivate'}
                                            </button>
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
