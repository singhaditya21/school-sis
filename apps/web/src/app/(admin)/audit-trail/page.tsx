import Link from 'next/link';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

/**
 * Audit trail — security review.
 *
 * A reviewer's lens over the same `audit_logs` rows the full log at /audit
 * lists: who acted, how often, from how many addresses, how much of it was
 * outside working hours, and which entries involve destructive or money-moving
 * actions. Every number is a SQL aggregate over the selected window.
 */

/** Actions a reviewer is expected to look at line by line. */
const REVIEWABLE_ACTIONS = ['DELETE', 'ROLE_CHANGE', 'EXPORT', 'PAYMENT'] as const;

/**
 * Working hours used for the off-hours count. Timestamps are stored with a
 * timezone; they are converted to IST because this is the operating timezone
 * for Indian schools, and the boundary is stated on the page.
 */
const SCHOOL_TIMEZONE = 'Asia/Kolkata';
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;

const WINDOW_OPTIONS = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last 12 months' },
] as const;

interface TotalsRow {
    total: number;
    reviewable: number;
    unattributed: number;
    off_hours: number;
    actors: number;
}

interface ActorRow {
    actor_name: string | null;
    actor_email: string | null;
    actor_role: string | null;
    events: number;
    reviewable: number;
    ip_count: number;
    off_hours: number;
    last_seen: Date;
}

interface EventRow {
    id: string;
    created_at: Date;
    action: string;
    entity_type: string;
    entity_id: string | null;
    description: string | null;
    ip_address: string | null;
    actor_name: string | null;
    actor_role: string | null;
}

export default async function AuditTrailPage({
    searchParams,
}: {
    searchParams: Promise<{ window?: string }>;
}) {
    const { tenantId } = await requireAuth('audit:read');
    const raw = await searchParams;
    const windowValue = WINDOW_OPTIONS.some((option) => option.value === raw.window)
        ? (raw.window as string)
        : '30';
    const windowDays = Number(windowValue);
    const windowLabel =
        WINDOW_OPTIONS.find((option) => option.value === windowValue)?.label ?? 'Last 30 days';

    const scope = `al.tenant_id = $1 AND al.created_at >= now() - make_interval(days => $2::integer)`;
    const offHoursExpr = `(extract(hour FROM al.created_at AT TIME ZONE '${SCHOOL_TIMEZONE}') < ${DAY_START_HOUR}
                           OR extract(hour FROM al.created_at AT TIME ZONE '${SCHOOL_TIMEZONE}') >= ${DAY_END_HOUR})`;
    const reviewableExpr = `al.action IN (${REVIEWABLE_ACTIONS.map((a) => `'${a}'`).join(', ')})`;
    const params = [tenantId, windowDays];

    const [totalsResult, actorsResult, eventsResult] = await Promise.all([
        pool.query<TotalsRow>(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE ${reviewableExpr})::int AS reviewable,
                    count(*) FILTER (WHERE al.user_id IS NULL)::int AS unattributed,
                    count(*) FILTER (WHERE ${offHoursExpr})::int AS off_hours,
                    count(DISTINCT al.user_id)::int AS actors
               FROM audit_logs al
              WHERE ${scope}`,
            params,
        ),
        pool.query<ActorRow>(
            `SELECT (u.first_name || ' ' || u.last_name) AS actor_name,
                    u.email AS actor_email,
                    u.role::text AS actor_role,
                    count(*)::int AS events,
                    count(*) FILTER (WHERE ${reviewableExpr})::int AS reviewable,
                    count(DISTINCT al.ip_address)::int AS ip_count,
                    count(*) FILTER (WHERE ${offHoursExpr})::int AS off_hours,
                    max(al.created_at) AS last_seen
               FROM audit_logs al
               LEFT JOIN users u ON u.id = al.user_id
              WHERE ${scope}
              GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
              ORDER BY reviewable DESC, events DESC
              LIMIT 25`,
            params,
        ),
        pool.query<EventRow>(
            `SELECT al.id,
                    al.created_at,
                    al.action::text AS action,
                    al.entity_type,
                    al.entity_id,
                    al.description,
                    al.ip_address,
                    (u.first_name || ' ' || u.last_name) AS actor_name,
                    u.role::text AS actor_role
               FROM audit_logs al
               LEFT JOIN users u ON u.id = al.user_id
              WHERE ${scope} AND ${reviewableExpr}
              ORDER BY al.created_at DESC
              LIMIT 100`,
            params,
        ),
    ]);

    const totals = totalsResult.rows[0] ?? {
        total: 0,
        reviewable: 0,
        unattributed: 0,
        off_hours: 0,
        actors: 0,
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Audit trail review</h1>
                    <p className="mt-1 text-gray-600">
                        Who did what, from where, and which entries deserve a second look. {windowLabel}.
                    </p>
                </div>
                <div className="flex items-end gap-3">
                    <form method="GET" className="flex items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Period
                            </span>
                            <select
                                name="window"
                                defaultValue={windowValue}
                                className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                            >
                                {WINDOW_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="submit"
                            className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            Apply
                        </button>
                    </form>
                    <Link
                        href="/audit"
                        className="h-9 rounded-md border border-gray-300 px-4 text-sm font-medium leading-9 text-gray-700 hover:bg-gray-50"
                    >
                        Full log
                    </Link>
                </div>
            </header>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Metric label="Recorded events" value={totals.total} hint={`Across ${totals.actors} signed-in actor(s)`} />
                <Metric
                    label="Needing review"
                    value={totals.reviewable}
                    hint={REVIEWABLE_ACTIONS.join(' · ')}
                    emphasise={totals.reviewable > 0}
                />
                <Metric
                    label="Outside working hours"
                    value={totals.off_hours}
                    hint={`Before ${DAY_START_HOUR}:00 or after ${DAY_END_HOUR}:00 IST`}
                />
                <Metric
                    label="No user recorded"
                    value={totals.unattributed}
                    hint="Entries with a null user_id"
                />
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Activity by actor</h2>
                {actorsResult.rows.length === 0 ? (
                    <EmptyState message="No audited activity in this window." />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Actor</th>
                                    <th className="px-4 py-3 font-semibold">Role</th>
                                    <th className="px-4 py-3 font-semibold text-right">Events</th>
                                    <th className="px-4 py-3 font-semibold text-right">Needing review</th>
                                    <th className="px-4 py-3 font-semibold text-right">Distinct IPs</th>
                                    <th className="px-4 py-3 font-semibold text-right">Off hours</th>
                                    <th className="px-4 py-3 font-semibold">Last seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {actorsResult.rows.map((row) => (
                                    <tr
                                        key={row.actor_email ?? 'unattributed'}
                                        className="hover:bg-gray-50/70"
                                    >
                                        <td className="px-4 py-3">
                                            {row.actor_name ? (
                                                <>
                                                    <div className="font-medium text-gray-900">{row.actor_name}</div>
                                                    <div className="text-xs text-gray-500">{row.actor_email}</div>
                                                </>
                                            ) : (
                                                <span className="italic text-gray-500">No user recorded</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{row.actor_role ?? '—'}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">{row.events}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {row.reviewable > 0 ? (
                                                <span className="font-semibold text-amber-700">{row.reviewable}</span>
                                            ) : (
                                                <span className="text-gray-400">0</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">{row.ip_count}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">{row.off_hours}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                            {new Date(row.last_seen).toLocaleString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">
                    Entries needing review
                </h2>
                <p className="text-sm text-gray-500">
                    Deletions, role changes, exports and payments recorded in this window, newest first
                    (up to 100).
                </p>
                {eventsResult.rows.length === 0 ? (
                    <EmptyState message="No deletions, role changes, exports or payments were recorded in this window." />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">When</th>
                                    <th className="px-4 py-3 font-semibold">Action</th>
                                    <th className="px-4 py-3 font-semibold">Actor</th>
                                    <th className="px-4 py-3 font-semibold">Entity</th>
                                    <th className="px-4 py-3 font-semibold">Description</th>
                                    <th className="px-4 py-3 font-semibold">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {eventsResult.rows.map((row) => (
                                    <tr key={row.id} className="align-top hover:bg-gray-50/70">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                            {new Date(row.created_at).toLocaleString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                                {row.action}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {row.actor_name ?? <span className="italic text-gray-500">No user recorded</span>}
                                            {row.actor_role && (
                                                <div className="text-xs text-gray-500">{row.actor_role}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                                            {row.entity_type}
                                            {row.entity_id && (
                                                <div className="text-[11px] text-gray-400" title={row.entity_id}>
                                                    {row.entity_id.slice(0, 8)}…
                                                </div>
                                            )}
                                        </td>
                                        <td className="max-w-sm px-4 py-3 text-gray-700">
                                            {row.description ?? <span className="text-gray-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                            {row.ip_address ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Read these figures with their limits in mind</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                        Sign-in and sign-out are not written to <code>audit_logs</code> in this release, so this
                        page cannot show failed logins, session counts or unusual sign-in locations.
                    </li>
                    <li>
                        &ldquo;Distinct IPs&rdquo; counts only entries where an address was captured; server-side flows
                        record none, and those entries are counted as zero rather than guessed.
                    </li>
                    <li>
                        There is no anomaly scoring behind this page. Rows are listed because of their action
                        type or their timestamp, not because anything has judged them suspicious.
                    </li>
                </ul>
            </section>
        </div>
    );
}

function Metric({
    label,
    value,
    hint,
    emphasise = false,
}: {
    label: string;
    value: number;
    hint: string;
    emphasise?: boolean;
}) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
            <div
                className={`mt-1 text-2xl font-bold ${emphasise ? 'text-amber-700' : 'text-gray-900'}`}
            >
                {value.toLocaleString('en-IN')}
            </div>
            <div className="mt-1 text-xs text-gray-500">{hint}</div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
            {message}
        </div>
    );
}
