import Link from 'next/link';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { AuditLogTable, type AuditRow } from './AuditClient';

export const dynamic = 'force-dynamic';

/**
 * Audit log explorer.
 *
 * Reads `audit_logs` directly (columns: action, entity_type, entity_id,
 * description, before_state, after_state, ip_address, user_agent, created_at).
 * Filters are applied in SQL so the counters describe the whole matching set,
 * not just the rows on the current page.
 */

const PAGE_SIZE = 50;

/** Values of the `audit_action` Postgres enum. */
const AUDIT_ACTIONS = [
    'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PAYMENT', 'ROLE_CHANGE', 'READ',
] as const;

const WINDOW_OPTIONS = [
    { value: '1', label: 'Last 24 hours' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last 12 months' },
    { value: 'all', label: 'All time' },
] as const;

interface DbAuditRow {
    id: string;
    created_at: Date;
    action: string;
    entity_type: string;
    entity_id: string | null;
    description: string | null;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    actor_name: string | null;
    actor_email: string | null;
    actor_role: string | null;
}

interface DbSummaryRow {
    total: number;
    actors: number;
    today: number;
    oldest: Date | null;
    newest: Date | null;
}

interface DbBreakdownRow {
    action: string;
    count: number;
}

interface AuditSearchParams {
    action?: string;
    entity?: string;
    q?: string;
    window?: string;
    page?: string;
}

function buildQueryString(base: AuditSearchParams, overrides: Partial<AuditSearchParams>): string {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...base, ...overrides })) {
        if (value) merged[key] = value;
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `?${qs}` : '';
}

export default async function AuditPage({
    searchParams,
}: {
    searchParams: Promise<AuditSearchParams>;
}) {
    const { tenantId } = await requireAuth('audit:read');
    const raw = await searchParams;

    // Validate every filter against a known-good set before it reaches SQL.
    const action = AUDIT_ACTIONS.includes(raw.action as (typeof AUDIT_ACTIONS)[number])
        ? (raw.action as string)
        : '';
    const entity = (raw.entity ?? '').trim();
    const search = (raw.q ?? '').trim();
    const windowValue = WINDOW_OPTIONS.some((option) => option.value === raw.window)
        ? (raw.window as string)
        : '30';
    const windowDays = windowValue === 'all' ? null : Number(windowValue);
    const page = Math.max(Number(raw.page) || 1, 1);

    // The dropdown of entity types is built from what this tenant has actually logged.
    const entityTypesResult = await pool.query<{ entity_type: string }>(
        `SELECT DISTINCT entity_type
           FROM audit_logs
          WHERE tenant_id = $1
          ORDER BY entity_type`,
        [tenantId],
    );
    const knownEntityTypes = entityTypesResult.rows.map((row) => row.entity_type);
    const entityType = knownEntityTypes.includes(entity) ? entity : '';

    const where: string[] = ['al.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (windowDays !== null) {
        params.push(windowDays);
        where.push(`al.created_at >= now() - make_interval(days => $${params.length}::integer)`);
    }
    if (action) {
        params.push(action);
        where.push(`al.action = $${params.length}::audit_action`);
    }
    if (entityType) {
        params.push(entityType);
        where.push(`al.entity_type = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(
            `(al.description ILIKE $${i}
              OR al.entity_type ILIKE $${i}
              OR al.ip_address ILIKE $${i}
              OR al.entity_id::text ILIKE $${i}
              OR (u.first_name || ' ' || u.last_name) ILIKE $${i}
              OR u.email ILIKE $${i})`,
        );
    }

    const whereSql = where.join('\n              AND ');
    const from = `FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE ${whereSql}`;

    const rowParams = [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE];
    const [rowsResult, summaryResult, breakdownResult] = await Promise.all([
        pool.query<DbAuditRow>(
            `SELECT al.id,
                    al.created_at,
                    al.action::text AS action,
                    al.entity_type,
                    al.entity_id,
                    al.description,
                    al.before_state,
                    al.after_state,
                    al.ip_address,
                    al.user_agent,
                    (u.first_name || ' ' || u.last_name) AS actor_name,
                    u.email AS actor_email,
                    u.role::text AS actor_role
             ${from}
             ORDER BY al.created_at DESC, al.id DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            rowParams,
        ),
        pool.query<DbSummaryRow>(
            `SELECT count(*)::int AS total,
                    count(DISTINCT al.user_id)::int AS actors,
                    count(*) FILTER (WHERE al.created_at >= date_trunc('day', now()))::int AS today,
                    min(al.created_at) AS oldest,
                    max(al.created_at) AS newest
             ${from}`,
            params,
        ),
        pool.query<DbBreakdownRow>(
            `SELECT al.action::text AS action, count(*)::int AS count
             ${from}
             GROUP BY 1
             ORDER BY 2 DESC, 1`,
            params,
        ),
    ]);

    const rows: AuditRow[] = rowsResult.rows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        description: row.description,
        beforeState: row.before_state,
        afterState: row.after_state,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        actorName: row.actor_name,
        actorEmail: row.actor_email,
        actorRole: row.actor_role,
    }));

    const summary = summaryResult.rows[0] ?? { total: 0, actors: 0, today: 0, oldest: null, newest: null };
    const lastPage = Math.max(Math.ceil(summary.total / PAGE_SIZE), 1);
    const currentParams: AuditSearchParams = {
        action: action || undefined,
        entity: entityType || undefined,
        q: search || undefined,
        window: windowValue,
    };
    const hasFilters = Boolean(action || entityType || search) || windowValue !== '30';

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-gray-900">Audit log</h1>
                <p className="mt-1 text-gray-600">
                    Every entry recorded in this school&apos;s audit log, straight from the database.
                </p>
            </header>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryCard label="Matching entries" value={summary.total.toLocaleString('en-IN')} />
                <SummaryCard label="Recorded today" value={summary.today.toLocaleString('en-IN')} />
                <SummaryCard label="Distinct actors" value={summary.actors.toLocaleString('en-IN')} />
                <SummaryCard
                    label="Most recent entry"
                    value={
                        summary.newest
                            ? new Date(summary.newest).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : 'None'
                    }
                />
            </section>

            <form method="GET" className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search</span>
                        <input
                            type="text"
                            name="q"
                            defaultValue={search}
                            placeholder="Description, actor, entity id or IP"
                            className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action</span>
                        <select
                            name="action"
                            defaultValue={action}
                            className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                        >
                            <option value="">All actions</option>
                            {AUDIT_ACTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entity type</span>
                        <select
                            name="entity"
                            defaultValue={entityType}
                            className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                            disabled={knownEntityTypes.length === 0}
                        >
                            <option value="">
                                {knownEntityTypes.length === 0 ? 'Nothing logged yet' : 'All entity types'}
                            </option>
                            {knownEntityTypes.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Period</span>
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
                    {hasFilters && (
                        <Link
                            href="/audit"
                            className="h-9 rounded-md border border-gray-300 px-4 text-sm font-medium leading-9 text-gray-700 hover:bg-gray-50"
                        >
                            Reset
                        </Link>
                    )}
                </div>
            </form>

            {breakdownResult.rows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {breakdownResult.rows.map((bucket) => (
                        <Link
                            key={bucket.action}
                            href={`/audit${buildQueryString(currentParams, {
                                action: bucket.action === action ? undefined : bucket.action,
                                page: undefined,
                            })}`}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                bucket.action === action
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            {bucket.action} · {bucket.count.toLocaleString('en-IN')}
                        </Link>
                    ))}
                </div>
            )}

            <AuditLogTable rows={rows} />

            {summary.total > PAGE_SIZE && (
                <nav className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                        Page {page} of {lastPage}
                    </span>
                    <div className="flex gap-2">
                        <PageLink
                            href={`/audit${buildQueryString(currentParams, { page: String(page - 1) })}`}
                            disabled={page <= 1}
                        >
                            Previous
                        </PageLink>
                        <PageLink
                            href={`/audit${buildQueryString(currentParams, { page: String(page + 1) })}`}
                            disabled={page >= lastPage}
                        >
                            Next
                        </PageLink>
                    </div>
                </nav>
            )}

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">What this log does and does not cover</p>
                <p className="mt-1">
                    Entries appear here only for the flows that write to <code>audit_logs</code> today —
                    student admissions, recorded payments, custom-object reads and writes, and the
                    migration adoption workflow.
                    {knownEntityTypes.length > 0 && (
                        <> Entity types seen so far: {knownEntityTypes.join(', ')}.</>
                    )}
                </p>
                <p className="mt-2">
                    Sign-in and sign-out are <strong>not</strong> written to this log in this release, so an
                    absence of <code>LOGIN</code> entries is not evidence that nobody signed in. Treat the log
                    as a record of the actions listed above rather than a complete account of system activity.
                </p>
            </section>
        </div>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
        </div>
    );
}

function PageLink({
    href,
    disabled,
    children,
}: {
    href: string;
    disabled: boolean;
    children: React.ReactNode;
}) {
    if (disabled) {
        return (
            <span className="cursor-not-allowed rounded-md border border-gray-200 px-3 py-1.5 text-gray-400">
                {children}
            </span>
        );
    }
    return (
        <Link href={href} className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">
            {children}
        </Link>
    );
}
