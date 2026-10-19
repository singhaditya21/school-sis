'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, RefreshCw, Send, Server } from 'lucide-react';
import type { ChannelReadiness, NotificationChannel } from '@/lib/notifications/channels';
import {
    retryOutboxNotification,
    sendTestChannelNotification,
    type OutboxMessageRow,
    type OutboxSummaryRow,
} from './actions';

export function IntegrationsClient({
    channels,
    summary,
    recentOutbox,
    defaultEmail,
}: {
    channels: ChannelReadiness[];
    summary: OutboxSummaryRow[];
    recentOutbox: OutboxMessageRow[];
    defaultEmail: string;
}) {
    const router = useRouter();
    const [recipients, setRecipients] = useState<Record<string, string>>({
        EMAIL: defaultEmail,
        SMS: '+919876543210',
        WHATSAPP: '+919876543210',
        PUSH: 'device-token-check',
        IN_APP: defaultEmail,
    });
    const [isPending, startTransition] = useTransition();

    const handleTestSend = (channel: NotificationChannel) => {
        const target = recipients[channel] || '';
        startTransition(async () => {
            const res = await sendTestChannelNotification(channel, target);
            if (!res.success) {
                toast.error(res.error || `Failed to dispatch on ${channel}`);
            } else {
                toast.success(`${channel} test notification dispatched (${res.status})`);
            }
            router.refresh();
        });
    };

    const handleRetry = (id: string) => {
        startTransition(async () => {
            const res = await retryOutboxNotification(id);
            if (!res.success) {
                toast.error(res.error || 'Retry failed');
            } else {
                toast.success(`Outbox item processed (${res.status})`);
            }
            router.refresh();
        });
    };

    return (
        <div className="space-y-6" data-testid="integrations-console">
            {/* Channel Readiness Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels.map((ch) => (
                    <Card
                        key={ch.channel}
                        className="shadow-sm border-border"
                        data-testid={`channel-card-${ch.channel}`}
                    >
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                    <Server className="w-4 h-4 text-primary" />
                                    {ch.channel}
                                </CardTitle>
                                <Badge
                                    variant="outline"
                                    className={
                                        ch.available
                                            ? 'bg-success-subtle text-success border-success/30'
                                            : 'bg-warning-subtle text-warning border-warning/30'
                                    }
                                >
                                    {ch.available ? 'Ready' : 'Unconfigured'}
                                </Badge>
                            </div>
                            <CardDescription className="text-xs font-mono">
                                Provider: {ch.provider}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            {ch.available ? (
                                <div className="flex items-center gap-2 text-xs text-success bg-success-subtle/40 p-2.5 rounded-lg border border-success/20">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    <span>Adapter credentials verified for live dispatch.</span>
                                </div>
                            ) : (
                                <div className="space-y-2 text-xs bg-warning-subtle/40 p-2.5 rounded-lg border border-warning/20">
                                    <div className="flex items-start gap-2 text-warning font-medium">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>{ch.reason || 'Provider credentials missing.'}</span>
                                    </div>
                                    {ch.missing.length > 0 && (
                                        <div className="text-muted-foreground font-mono text-[11px] pl-6">
                                            Missing env: {ch.missing.join(', ')}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-2 flex items-center gap-2">
                                <Input
                                    value={recipients[ch.channel] ?? ''}
                                    onChange={(e) =>
                                        setRecipients((prev) => ({
                                            ...prev,
                                            [ch.channel]: e.target.value,
                                        }))
                                    }
                                    placeholder="Recipient..."
                                    className="h-8 text-xs"
                                    disabled={!ch.available || isPending}
                                    data-testid={`test-recipient-${ch.channel}`}
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs shrink-0"
                                    disabled={!ch.available || isPending}
                                    onClick={() => handleTestSend(ch.channel)}
                                    data-testid={`send-test-${ch.channel}`}
                                >
                                    <Send className="w-3.5 h-3.5 mr-1" />
                                    Test
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Outbox Telemetry Summary */}
            {summary.length > 0 && (
                <Card className="shadow-sm border-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Outbox Volume by Channel &amp; Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {summary.map((s) => (
                                <div
                                    key={`${s.channel}-${s.provider}-${s.status}`}
                                    className="px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs flex items-center gap-2"
                                >
                                    <span className="font-semibold text-foreground">{s.channel}</span>
                                    <span className="text-muted-foreground">({s.provider})</span>
                                    <Badge variant="outline" className="text-[10px]">
                                        {s.status}: {s.count}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Recent Notification Outbox Queue */}
            <Card className="shadow-sm border-border overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Notification Outbox Queue</CardTitle>
                    <CardDescription>
                        Live audit of outbound workflow emails, SMS, WhatsApp, and in-app dispatches for this tenant.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left" data-testid="outbox-table">
                            <thead className="bg-muted border-y border-border text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Channel</th>
                                    <th className="px-4 py-3">Recipient</th>
                                    <th className="px-4 py-3">Subject / Error</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Attempts</th>
                                    <th className="px-4 py-3 text-right">Created</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {recentOutbox.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                            No notifications have been queued in the outbox for this tenant yet.
                                        </td>
                                    </tr>
                                ) : (
                                    recentOutbox.map((item) => (
                                        <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="font-medium text-foreground">{item.channel}</div>
                                                <div className="text-xs text-muted-foreground font-mono">
                                                    {item.provider}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-foreground">
                                                {item.recipient}
                                            </td>
                                            <td className="px-4 py-3 max-w-xs">
                                                <div className="text-foreground truncate">
                                                    {item.subject || '—'}
                                                </div>
                                                {item.lastError && (
                                                    <div className="text-xs text-destructive truncate mt-0.5">
                                                        {item.lastError}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        item.status === 'SENT' || item.status === 'DELIVERED'
                                                            ? 'bg-success-subtle text-success border-0'
                                                            : item.status === 'FAILED' || item.status === 'DEAD_LETTER'
                                                              ? 'bg-destructive-subtle text-destructive border-0'
                                                              : 'bg-warning-subtle text-warning border-0'
                                                    }
                                                >
                                                    {item.status}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                                                {item.attempts} / {item.maxAttempts}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(item.createdAt).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {['PENDING', 'QUEUED', 'FAILED'].includes(item.status) && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-xs"
                                                        disabled={isPending}
                                                        onClick={() => handleRetry(item.id)}
                                                        data-testid={`retry-outbox-${item.id}`}
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                                        Retry
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
