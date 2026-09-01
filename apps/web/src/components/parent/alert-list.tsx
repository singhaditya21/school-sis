'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { markAlertRead, markAllAlertsRead, type ParentAlertItem } from '@/app/(parent)/actions';

function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (!Number.isFinite(diffMs)) return '';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
}

const CHANNEL_STYLE: Record<string, { border: string; bg: string; icon: string }> = {
    SMS: { border: 'border-l-rose-500', bg: 'bg-rose-100', icon: '📱' },
    PUSH: { border: 'border-l-rose-500', bg: 'bg-rose-100', icon: '🔔' },
    EMAIL: { border: 'border-l-indigo-500', bg: 'bg-indigo-100', icon: '📧' },
    WHATSAPP: { border: 'border-l-emerald-500', bg: 'bg-emerald-100', icon: '💬' },
};

export function AlertList({ alerts }: { alerts: ParentAlertItem[] }) {
    const [pending, startTransition] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);

    const unread = alerts.filter((a) => !a.isRead);

    function handleMarkRead(id: string) {
        setBusyId(id);
        startTransition(async () => {
            const result = await markAlertRead(id);
            setBusyId(null);
            if (!result.success) toast.error(result.error ?? 'Could not mark this alert as read.');
        });
    }

    function handleMarkAllRead() {
        startTransition(async () => {
            const result = await markAllAlertsRead();
            if (result.updated === 0) {
                toast.error('There was nothing left to mark as read.');
            } else {
                toast.success(`Marked ${result.updated} alert${result.updated === 1 ? '' : 's'} as read.`);
            }
        });
    }

    if (alerts.length === 0) {
        return (
            <div className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
                    🔕
                </div>
                <p className="font-medium text-muted-foreground">No alerts yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Messages the school sends to your account will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {unread.length > 0
                        ? `${unread.length} unread of ${alerts.length}`
                        : `${alerts.length} alert${alerts.length === 1 ? '' : 's'}, all read`}
                </p>
                {unread.length > 0 && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={handleMarkAllRead}>
                        Mark all as read
                    </Button>
                )}
            </div>

            {alerts.map((alert) => {
                const style = CHANNEL_STYLE[alert.channel] ?? {
                    border: 'border-l-amber-500',
                    bg: 'bg-amber-100',
                    icon: '📋',
                };

                return (
                    <Card
                        key={alert.id}
                        className={`border-l-4 shadow-sm ${style.border} ${
                            alert.isRead ? 'bg-card' : 'bg-muted/80'
                        }`}
                    >
                        <CardContent className="flex items-start gap-4 p-5">
                            <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${style.bg}`}
                            >
                                {style.icon}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-start justify-between gap-4">
                                    <h2
                                        className={`text-lg leading-tight text-foreground ${
                                            alert.isRead ? 'font-medium' : 'font-semibold'
                                        }`}
                                    >
                                        {alert.subject || 'Notification'}
                                    </h2>
                                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                        {timeAgo(alert.sentAt ?? alert.createdAt)}
                                    </span>
                                </div>
                                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{alert.body}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                        {alert.channel}
                                    </span>
                                    <span
                                        className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                                            alert.status === 'FAILED'
                                                ? 'bg-red-100 text-red-700'
                                                : alert.isRead
                                                  ? 'bg-muted text-muted-foreground'
                                                  : 'bg-emerald-100 text-emerald-700'
                                        }`}
                                    >
                                        {alert.status}
                                    </span>
                                    {!alert.isRead && alert.status !== 'FAILED' && (
                                        <button
                                            type="button"
                                            disabled={pending && busyId === alert.id}
                                            onClick={() => handleMarkRead(alert.id)}
                                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                                        >
                                            {pending && busyId === alert.id ? 'Marking…' : 'Mark as read'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
