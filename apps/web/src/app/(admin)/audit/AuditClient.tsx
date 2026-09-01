'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Audit log table.
 *
 * Every field rendered here maps 1:1 to a column on `audit_logs`
 * (see apps/web/drizzle/0000_init_baseline.sql). Nothing is synthesised:
 * if a column is null the cell says so rather than substituting a default.
 */
export interface AuditRow {
    id: string;
    createdAt: string;
    action: string;
    entityType: string;
    entityId: string | null;
    description: string | null;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    ipAddress: string | null;
    userAgent: string | null;
    actorName: string | null;
    actorEmail: string | null;
    actorRole: string | null;
}

const ACTION_STYLES: Record<string, string> = {
    CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
    DELETE: 'bg-red-50 text-red-700 border-red-200',
    LOGIN: 'bg-violet-50 text-violet-700 border-violet-200',
    LOGOUT: 'bg-muted text-foreground border-border',
    EXPORT: 'bg-amber-50 text-amber-700 border-amber-200',
    PAYMENT: 'bg-teal-50 text-teal-700 border-teal-200',
    ROLE_CHANGE: 'bg-orange-50 text-orange-700 border-orange-200',
    READ: 'bg-muted text-muted-foreground border-border',
};

function formatTimestamp(value: string): { date: string; time: string } {
    const d = new Date(value);
    return {
        date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
}

function renderValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Keys present in before_state or after_state whose values differ. */
function changedKeys(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
): string[] {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    return Array.from(keys)
        .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
        .sort();
}

function toCsv(rows: AuditRow[]): string {
    const escape = (value: string | null): string => `"${(value ?? '').replace(/"/g, '""')}"`;
    const header = [
        'Timestamp (ISO)', 'Action', 'Entity type', 'Entity id',
        'Actor', 'Actor email', 'Actor role', 'Description', 'IP address', 'User agent',
    ].join(',');
    const body = rows.map((row) =>
        [
            escape(row.createdAt),
            escape(row.action),
            escape(row.entityType),
            escape(row.entityId),
            escape(row.actorName),
            escape(row.actorEmail),
            escape(row.actorRole),
            escape(row.description),
            escape(row.ipAddress),
            escape(row.userAgent),
        ].join(','),
    );
    return [header, ...body].join('\n');
}

export function AuditLogTable({ rows }: { rows: AuditRow[] }) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleExport = () => {
        const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (rows.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
                <p className="font-medium text-foreground">No audit entries match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Widen the time window or clear the filters. If the log is empty across all time,
                    no audited action has been performed in this school yet.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {rows.length} {rows.length === 1 ? 'entry' : 'entries'} on this page.
                </p>
                <Button variant="outline" size="sm" onClick={handleExport}>
                    Export this page as CSV
                </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-semibold">When</th>
                            <th className="px-4 py-3 font-semibold">Actor</th>
                            <th className="px-4 py-3 font-semibold">Action</th>
                            <th className="px-4 py-3 font-semibold">Entity</th>
                            <th className="px-4 py-3 font-semibold">Description</th>
                            <th className="px-4 py-3 font-semibold">IP</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((row) => {
                            const stamp = formatTimestamp(row.createdAt);
                            const isOpen = expandedId === row.id;
                            const diff = changedKeys(row.beforeState, row.afterState);
                            return (
                                <tr key={row.id} className="align-top hover:bg-muted/70">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="font-medium text-foreground">{stamp.date}</div>
                                        <div className="text-xs text-muted-foreground">{stamp.time}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {row.actorName ? (
                                            <>
                                                <div className="font-medium text-foreground">{row.actorName}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.actorRole ?? 'role not recorded'}
                                                </div>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground italic">no user recorded</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={ACTION_STYLES[row.action] ?? 'bg-muted text-muted-foreground border-border'}
                                        >
                                            {row.action}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-mono text-xs text-foreground">{row.entityType}</div>
                                        {row.entityId && (
                                            <div className="font-mono text-[11px] text-muted-foreground" title={row.entityId}>
                                                {row.entityId.slice(0, 8)}…
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-foreground">
                                        <div className="max-w-md">
                                            {row.description ?? <span className="text-muted-foreground">—</span>}
                                        </div>
                                        {isOpen && (
                                            <div className="mt-3 space-y-3 rounded-lg bg-muted p-3 text-xs">
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">Log id: </span>
                                                    <span className="font-mono text-muted-foreground">{row.id}</span>
                                                </div>
                                                {row.entityId && (
                                                    <div>
                                                        <span className="font-semibold text-muted-foreground">Entity id: </span>
                                                        <span className="font-mono text-muted-foreground">{row.entityId}</span>
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">User agent: </span>
                                                    <span className="text-muted-foreground break-all">
                                                        {row.userAgent ?? 'not recorded'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="mb-1 font-semibold text-muted-foreground">Recorded state</div>
                                                    {diff.length === 0 ? (
                                                        <p className="text-muted-foreground">
                                                            No before/after state was captured for this entry.
                                                        </p>
                                                    ) : (
                                                        <table className="w-full">
                                                            <thead className="text-left text-muted-foreground">
                                                                <tr>
                                                                    <th className="py-1 pr-3 font-medium">Field</th>
                                                                    <th className="py-1 pr-3 font-medium">Before</th>
                                                                    <th className="py-1 font-medium">After</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {diff.map((key) => (
                                                                    <tr key={key} className="border-t border-border">
                                                                        <td className="py-1 pr-3 font-mono">{key}</td>
                                                                        <td className="py-1 pr-3 font-mono text-muted-foreground break-all">
                                                                            {renderValue(row.beforeState?.[key])}
                                                                        </td>
                                                                        <td className="py-1 font-mono text-foreground break-all">
                                                                            {renderValue(row.afterState?.[key])}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                        {row.ipAddress ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(isOpen ? null : row.id)}
                                            className="text-xs font-medium text-primary hover:underline"
                                        >
                                            {isOpen ? 'Hide' : 'Details'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
