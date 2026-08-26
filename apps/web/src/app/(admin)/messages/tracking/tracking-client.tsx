'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChannelBadge, StatTile, StatusBadge, formatDateTime } from '../ui';
import type { OutboxRow } from '../types';

const STATUS_OPTIONS = [
    'PENDING',
    'QUEUED',
    'SENT',
    'DELIVERED',
    'FAILED',
    'DEAD_LETTER',
    'SUPPRESSED',
] as const;

export default function TrackingClient({ rows }: { rows: OutboxRow[] }) {
    const [status, setStatus] = useState<string>('ALL');
    const [channel, setChannel] = useState<string>('ALL');
    const [search, setSearch] = useState('');

    const channels = useMemo(
        () => [...new Set(rows.map((row) => row.channel))].sort(),
        [rows],
    );

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (status !== 'ALL' && row.status !== status) return false;
            if (channel !== 'ALL' && row.channel !== channel) return false;
            if (!needle) return true;
            return (
                row.recipient.toLowerCase().includes(needle) ||
                row.body.toLowerCase().includes(needle) ||
                (row.subject || '').toLowerCase().includes(needle)
            );
        });
    }, [rows, status, channel, search]);

    const counts = useMemo(() => {
        const waiting = rows.filter((row) => row.status === 'PENDING' || row.status === 'QUEUED').length;
        const dispatched = rows.filter((row) => row.status === 'SENT' || row.status === 'DELIVERED').length;
        const failed = rows.filter(
            (row) => row.status === 'FAILED' || row.status === 'DEAD_LETTER',
        ).length;
        return { waiting, dispatched, failed, total: rows.length };
    }, [rows]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatTile label="Outbox rows" value={counts.total} hint="Most recent 200" />
                <StatTile
                    label="Awaiting a dispatcher"
                    value={counts.waiting}
                    tone={counts.waiting > 0 ? 'warning' : 'default'}
                />
                <StatTile
                    label="Reported by a provider"
                    value={counts.dispatched}
                    tone={counts.dispatched === 0 ? 'muted' : 'default'}
                />
                <StatTile
                    label="Failed / dead-lettered"
                    value={counts.failed}
                    tone={counts.failed > 0 ? 'danger' : 'muted'}
                />
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label htmlFor="outbox-status" className="mb-1 block text-xs font-medium text-slate-600">
                        Status
                    </label>
                    <select
                        id="outbox-status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                    >
                        <option value="ALL">All statuses</option>
                        {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="outbox-channel" className="mb-1 block text-xs font-medium text-slate-600">
                        Channel
                    </label>
                    <select
                        id="outbox-channel"
                        value={channel}
                        onChange={(event) => setChannel(event.target.value)}
                        className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                    >
                        <option value="ALL">All channels</option>
                        {channels.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="outbox-search" className="mb-1 block text-xs font-medium text-slate-600">
                        Search
                    </label>
                    <input
                        id="outbox-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Recipient or message text"
                        className="h-9 w-64 rounded-md border border-slate-300 px-3 text-sm"
                    />
                </div>
                <p className="pb-2 text-sm text-slate-500">
                    Showing {visible.length} of {rows.length}
                </p>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                                        Channel
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                                        Recipient
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                                        Message
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                                        Queued
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {visible.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`align-top hover:bg-slate-50 ${
                                            row.status === 'FAILED' || row.status === 'DEAD_LETTER'
                                                ? 'bg-rose-50'
                                                : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <ChannelBadge channel={row.channel} />
                                            <div className="mt-1 text-xs text-slate-400">
                                                via {row.provider}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-slate-700">
                                            {row.recipient}
                                        </td>
                                        <td className="max-w-sm px-4 py-3">
                                            {row.subject && (
                                                <div className="text-sm font-medium text-slate-800">
                                                    {row.subject}
                                                </div>
                                            )}
                                            <div className="line-clamp-2 text-sm text-slate-600">
                                                {row.body}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                                            {formatDateTime(row.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={row.status} />
                                            <div className="mt-1 text-xs text-slate-500">
                                                attempt {row.attempts} of {row.maxAttempts}
                                            </div>
                                            {row.sentAt && (
                                                <div className="text-xs text-slate-500">
                                                    dispatched {formatDateTime(row.sentAt)}
                                                </div>
                                            )}
                                            {row.providerMessageId && (
                                                <div className="font-mono text-[10px] text-slate-400">
                                                    {row.providerMessageId}
                                                </div>
                                            )}
                                            {row.lastError && (
                                                <div className="mt-1 max-w-xs text-xs text-rose-600">
                                                    {row.lastError}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {visible.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                            {rows.length === 0
                                                ? 'The outbox is empty. Compose a message to put something in it.'
                                                : 'No outbox rows match those filters.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
