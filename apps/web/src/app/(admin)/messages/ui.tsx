import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { CHANNEL_ICON, CHANNEL_LABEL, type ChannelAvailability, type MessageChannel } from './types';

export function ChannelBadge({ channel }: { channel: string }) {
    const known = channel as MessageChannel;
    const label = CHANNEL_LABEL[known] ?? channel;
    const icon = CHANNEL_ICON[known] ?? '📨';
    return (
        <Badge variant="outline" className="font-medium">
            <span aria-hidden="true">{icon}</span> {label}
        </Badge>
    );
}

const STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-muted text-foreground border-border',
    QUEUED: 'bg-amber-100 text-amber-800 border-amber-200',
    SENT: 'bg-blue-100 text-blue-800 border-blue-200',
    DELIVERED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    FAILED: 'bg-rose-100 text-rose-800 border-rose-200',
    DEAD_LETTER: 'bg-rose-100 text-rose-800 border-rose-200',
    SUPPRESSED: 'bg-muted text-muted-foreground border-border',
};

export function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLES[status] ?? 'bg-muted text-foreground border-border'
            }`}
        >
            {status.replace(/_/g, ' ')}
        </span>
    );
}

export function StatTile({
    label,
    value,
    hint,
    tone = 'default',
}: {
    label: string;
    value: number | string;
    hint?: string;
    tone?: 'default' | 'warning' | 'danger' | 'muted';
}) {
    const toneClass = {
        default: 'text-foreground',
        warning: 'text-amber-600',
        danger: 'text-rose-600',
        muted: 'text-muted-foreground',
    }[tone];

    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
    );
}

/**
 * The single most important honesty surface in this module: it states, from real
 * configuration, whether a channel can even accept a queued message, and that no
 * dispatcher delivers what is queued.
 */
export function DeliveryRealityNotice({
    availability,
    dispatched,
}: {
    availability: ChannelAvailability[];
    dispatched: number;
}) {
    const configured = availability.filter((a) => a.configured);
    const unconfigured = availability.filter((a) => !a.configured);

    return (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning-subtle-foreground">
            <p className="font-semibold">Messages are queued and dispatched daily — delivery receipts are limited.</p>
            <p className="mt-1">
                Composing writes a row to the notification outbox. A scheduled dispatcher
                (<code>/api/jobs/dispatch</code>, run daily) sends queued messages to their provider.
                Provider delivery receipts are not yet ingested for every channel, so a message can be
                sent without its status advancing to Delivered.
                {dispatched === 0
                    ? ' No message has been reported on by a provider on this tenant yet.'
                    : ` ${dispatched} outbox row(s) have been reported on by a provider.`}
            </p>
            <dl className="mt-3 space-y-1 text-xs">
                <div className="flex gap-2">
                    <dt className="font-semibold">Accepting a queue:</dt>
                    <dd>
                        {configured.length > 0
                            ? configured
                                  .map((a) => `${CHANNEL_LABEL[a.channel]} (${a.provider})`)
                                  .join(', ')
                            : 'no channel'}
                    </dd>
                </div>
                {unconfigured.map((entry) => (
                    <div key={entry.channel} className="flex gap-2">
                        <dt className="font-semibold">{CHANNEL_LABEL[entry.channel]} unavailable:</dt>
                        <dd>{entry.reason}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

export function MessagesTabs({ active }: { active: 'log' | 'compose' | 'templates' | 'tracking' }) {
    const tabs: { key: typeof active; href: string; label: string }[] = [
        { key: 'log', href: '/messages', label: 'Message log' },
        { key: 'compose', href: '/messages/compose', label: 'Compose' },
        { key: 'templates', href: '/messages/templates', label: 'Templates' },
        { key: 'tracking', href: '/messages/tracking', label: 'Outbox' },
    ];

    return (
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Messages sections">
            {tabs.map((tab) => (
                <Link
                    key={tab.key}
                    href={tab.href}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                        tab.key === active
                            ? 'border-slate-900 text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {tab.label}
                </Link>
            ))}
        </nav>
    );
}

export function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
