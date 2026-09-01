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
                    <label htmlFor="outbox-status" className="mb-1 block text-xs font-medium text-muted-foreground">
                        Status
                    </label>
                    <select
                        id="outbox-status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-9 rounded-md border border-border px-3 text-sm"
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
                    <label htmlFor="outbox-channel" className="mb-1 block text-xs font-medium text-muted-foreground">
                        Channel
                    </label>
                    <select
                        id="outbox-channel"
                        value={channel}
                        onChange={(event) => setChannel(event.target.value)}
                        className="h-9 rounded-md border border-border px-3 text-sm"
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
                    <label htmlFor="outbox-search" className="mb-1 block text-xs font-medium text-muted-foreground">
                        Search
                    </label>
                    <input
                        id="outbox-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Recipient or message text"
                        className="h-9 w-64 rounded-md border border-border px-3 text-sm"
                    />
                </div>
                <p className="pb-2 text-sm text-muted-foreground">
                    Showing {visible.length} of {rows.length}
                </p>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Channel
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Recipient
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Message
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Queued
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {visible.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`align-top hover:bg-muted ${
                                            row.status === 'FAILED' || row.status === 'DEAD_LETTER'
                                                ? 'bg-rose-50'
                                                : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <ChannelBadge channel={row.channel} />
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                via {row.provider}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-foreground">
                                            {row.recipient}
                                        </td>
                                        <td className="max-w-sm px-4 py-3">
                                            {row.subject && (
                                                <div className="text-sm font-medium text-foreground">
                                                    {row.subject}
                                                </div>
                                            )}
                                            <div className="line-clamp-2 text-sm text-muted-foreground">
                                                {row.body}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                                            {formatDateTime(row.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={row.status} />
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                attempt {row.attempts} of {row.maxAttempts}
                                            </div>
                                            {row.sentAt && (
                                                <div className="text-xs text-muted-foreground">
                                                    dispatched {formatDateTime(row.sentAt)}
                                                </div>
                                            )}
                                            {row.providerMessageId && (
                                                <div className="font-mono text-[10px] text-muted-foreground">
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
                                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
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
