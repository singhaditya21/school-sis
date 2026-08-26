import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import { Shield, Fingerprint, Users } from 'lucide-react';
import { format } from 'date-fns';

export const metadata = {
    title: 'Platform Audit Log | ScholarMind HQ',
};

interface AuditRow {
    id: string;
    actionType: string;
    metadata: string | null;
    ipAddress: string | null;
    createdAt: string | Date;
    actorEmail: string | null;
    targetTenantName: string | null;
    targetTenantCode: string | null;
}

interface ActionSummaryRow {
    actionType: string;
    total: number;
}

const PAGE_LIMIT = 100;

export default async function AuditPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows: logRows } = await pool.query(
        `SELECT
            a.id,
            a.action_type AS "actionType",
            a.metadata,
            a.ip_address  AS "ipAddress",
            a.created_at  AS "createdAt",
            u.email       AS "actorEmail",
            t.name        AS "targetTenantName",
            t.code        AS "targetTenantCode"
         FROM platform_audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN tenants t ON t.id = a.target_tenant_id
         ORDER BY a.created_at DESC
         LIMIT 100`
    );

    const { rows: summaryRows } = await pool.query(
        `SELECT
            action_type AS "actionType",
            COUNT(*)::int AS total
         FROM platform_audit_logs
         GROUP BY action_type
         ORDER BY total DESC`
    );

    const { rows: overallRows } = await pool.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(DISTINCT actor_id)::int AS actors,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last7
         FROM platform_audit_logs`
    );

    const logs = logRows as AuditRow[];
    const summary = summaryRows as ActionSummaryRow[];
    const overall = overallRows[0] as { total: number; actors: number; last7: number };

    const countOf = (prefix: string) =>
        summary
            .filter((s) => s.actionType.toUpperCase().includes(prefix))
            .reduce((sum, s) => sum + s.total, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Platform Audit Log</h1>
                <p className="text-sm text-slate-400 mt-1">
                    Cross-tenant actions taken from HQ — impersonation, provisioning and status changes.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Stat label="Recorded events" value={overall.total} hint="All time" icon={<Shield className="w-5 h-5 text-indigo-400" />} />
                <Stat label="Last 7 days" value={overall.last7} hint="Recent activity" icon={<Shield className="w-5 h-5 text-cyan-400" />} />
                <Stat label="Distinct actors" value={overall.actors} hint="Platform users who acted" icon={<Users className="w-5 h-5 text-slate-400" />} />
                <Stat
                    label="Impersonations"
                    value={countOf('IMPERSONATE')}
                    hint="Support sign-ins to a campus"
                    tone="amber"
                    icon={<Fingerprint className="w-5 h-5 text-amber-500" />}
                />
            </div>

            {summary.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-4">Events by type</h3>
                    <div className="flex flex-wrap gap-2">
                        {summary.map((s) => (
                            <span
                                key={s.actionType}
                                className="text-xs font-mono px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 text-slate-300"
                            >
                                {s.actionType}
                                <span className="text-slate-500"> · {s.total}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Event log</h3>
                    <span className="text-xs text-slate-500">
                        Showing most recent {Math.min(logs.length, PAGE_LIMIT)} of {overall.total}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Timestamp</th>
                                <th className="px-6 py-4 font-semibold">Action</th>
                                <th className="px-6 py-4 font-semibold">Actor</th>
                                <th className="px-6 py-4 font-semibold">Target campus</th>
                                <th className="px-6 py-4 font-semibold">Detail</th>
                                <th className="px-6 py-4 font-semibold">Source IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        No platform actions have been recorded yet.
                                    </td>
                                </tr>
                            )}
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-900/50 transition-colors align-top">
                                    <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                                        {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-xs font-bold tracking-wider ${
                                            log.actionType.includes('IMPERSONATE') ? 'text-amber-400' :
                                            log.actionType.includes('SUSPEND') || log.actionType.includes('DELETE') ? 'text-rose-400' :
                                            'text-indigo-400'
                                        }`}>
                                            {log.actionType}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-300">
                                        {log.actorEmail ?? <span className="text-slate-600">System</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {log.targetTenantName ? (
                                            <>
                                                <span className="text-white">{log.targetTenantName}</span>
                                                <span className="block text-slate-500 font-mono mt-0.5">{log.targetTenantCode}</span>
                                            </>
                                        ) : (
                                            <span className="text-slate-600">Platform-wide</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-400 max-w-sm">
                                        {log.metadata || <span className="text-slate-600">—</span>}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                                        {log.ipAddress || <span className="text-slate-600">Not captured</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-xs text-slate-500">
                This log records platform-level actions only. Per-campus activity is kept in each tenant&apos;s own audit trail
                and is not aggregated here.
            </p>
        </div>
    );
}

function Stat({
    label, value, hint, icon, tone,
}: {
    label: string;
    value: number;
    hint: string;
    icon: React.ReactNode;
    tone?: 'amber';
}) {
    return (
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-400 mb-1">{label}</p>
                    <p className={`text-3xl font-bold tabular-nums ${tone === 'amber' ? 'text-amber-400' : 'text-white'}`}>
                        {value.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{hint}</p>
                </div>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
}
