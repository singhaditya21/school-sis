import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { platformAuditLogs } from '@/lib/db/schema/platform';
import { users, tenants } from '@/lib/db/schema/core';
import { desc, eq } from 'drizzle-orm';
import { Shield, Fingerprint, Lock, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export const metadata = {
    title: 'Security Audit Logs | ScholarMind HQ',
};

export default async function AuditPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    // Fetch Security Audit Logs
    const logs = await db
        .select({
            id: platformAuditLogs.id,
            actionType: platformAuditLogs.actionType,
            metadata: platformAuditLogs.metadata,
            ipAddress: platformAuditLogs.ipAddress,
            createdAt: platformAuditLogs.createdAt,
            actorEmail: users.email,
            targetTenantName: tenants.name,
            targetTenantCode: tenants.code,
        })
        .from(platformAuditLogs)
        .leftJoin(users, eq(platformAuditLogs.actorId, users.id))
        .leftJoin(tenants, eq(platformAuditLogs.targetTenantId, tenants.id))
        .orderBy(desc(platformAuditLogs.createdAt))
        .limit(100);

    const totalLogs = logs.length;
    const suspicousNodesCount = logs.filter(l => l.actionType === 'SUSPEND').length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Security Audit Logs (SIEM)</h1>
                <p className="text-sm text-slate-400 mt-1">Cross-tenant impersonations, parameter tampering, and immutable state changes.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">State Mutators</p>
                            <p className="text-3xl font-bold text-white">{totalLogs}</p>
                        </div>
                        <Shield className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Impersonation Vectors</p>
                            <p className="text-3xl font-bold text-amber-400">{logs.filter(l => l.actionType === 'IMPERSONATE').length}</p>
                        </div>
                        <Fingerprint className="w-5 h-5 text-amber-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Authorization Guards</p>
                            <p className="text-3xl font-bold text-emerald-400">100%</p>
                        </div>
                        <Lock className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-red-900/50 bg-red-950/10 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-400 mb-1">Suspension Vectors</p>
                            <p className="text-3xl font-bold text-red-500">{suspicousNodesCount}</p>
                        </div>
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                    </div>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Immutable Vector Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Timestamp UTC</th>
                                <th className="px-6 py-4 font-semibold">Vector Hook</th>
                                <th className="px-6 py-4 font-semibold">Actor Email</th>
                                <th className="px-6 py-4 font-semibold">Target Node</th>
                                <th className="px-6 py-4 font-semibold">Source IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {logs.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No telemetry logged in SIEM buffers.</td></tr>
                            ) : null}
                            {logs.map((log, i) => (
                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                                        {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-indigo-400 tracking-wider text-xs">
                                        {log.actionType}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-300">
                                        {log.actorEmail || 'System Default'}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {log.targetTenantName ? (
                                            <div>
                                                <span className="text-white">{log.targetTenantName}</span>
                                                <span className="block text-slate-500 font-mono mt-0.5">{log.targetTenantCode}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-600 font-mono">GLOBAL / UNATTACHED</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-cyan-500/70">
                                        {log.ipAddress || 'Internal Routine'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
