import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getChannelAvailability, getMessagingOverview, listMessageBatches } from './actions';
import {
    ChannelBadge,
    DeliveryRealityNotice,
    MessagesTabs,
    StatTile,
    StatusBadge,
    formatDateTime,
} from './ui';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
    const [overview, availability, batches] = await Promise.all([
        getMessagingOverview(),
        getChannelAvailability(),
        listMessageBatches(50),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Messages</h1>
                <p className="mt-1 text-muted-foreground">
                    Compose parent and staff communication, manage templates, and inspect the
                    notification outbox.
                </p>
            </div>

            <MessagesTabs active="log" />

            <DeliveryRealityNotice availability={availability} dispatched={overview.dispatched} />

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatTile label="Batches composed" value={overview.batches} />
                <StatTile
                    label="Recipients queued"
                    value={overview.recipients}
                    hint="Across all batches"
                />
                <StatTile
                    label="Awaiting dispatch"
                    value={overview.queued}
                    tone="warning"
                    hint="Sitting in the outbox"
                />
                <StatTile
                    label="Rejected at queue time"
                    value={overview.failed}
                    tone={overview.failed > 0 ? 'danger' : 'muted'}
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="flex items-center justify-between border-b p-4">
                        <div>
                            <h2 className="font-bold">Message log</h2>
                            <p className="text-xs text-muted-foreground">
                                Every batch composed in this tenant, newest first.
                            </p>
                        </div>
                        <Link
                            href="/messages/compose"
                            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                        >
                            Compose message
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Channel
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Message
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-muted-foreground">
                                        Recipients
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Composed
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Outbox state
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {batches.map((batch) => (
                                    <tr key={batch.id} className="align-top hover:bg-muted">
                                        <td className="px-4 py-3">
                                            <ChannelBadge channel={batch.channel} />
                                        </td>
                                        <td className="max-w-md px-4 py-3">
                                            {batch.subject && (
                                                <div className="text-sm font-medium text-foreground">
                                                    {batch.subject}
                                                </div>
                                            )}
                                            <div className="line-clamp-2 text-sm text-muted-foreground">
                                                {batch.message}
                                            </div>
                                            {batch.templateName && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Template: {batch.templateName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            {batch.recipientCount}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                                            {formatDateTime(batch.sentAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={batch.status} />
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {batch.outboxPending} awaiting · {batch.outboxSent}{' '}
                                                dispatched · {batch.outboxFailed} failed
                                            </div>
                                            {batch.failureCount > 0 && (
                                                <div className="text-xs text-rose-600">
                                                    {batch.failureCount} recipient(s) never reached the
                                                    outbox
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {batches.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                            No messages composed yet.{' '}
                                            <Link href="/messages/compose" className="text-blue-600 underline">
                                                Compose the first one
                                            </Link>
                                            .
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
