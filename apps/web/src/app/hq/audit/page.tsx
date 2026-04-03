import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { setTenantContext } from '@/lib/db';
import { platformAuditLogs } from '@/lib/db/schema/platform';
import { users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getAuditLogs() {
    await setTenantContext('platform');
    const logs = await db
        .select({
            id: platformAuditLogs.id,
            actionType: platformAuditLogs.actionType,
            metadata: platformAuditLogs.metadata,
            ipAddress: platformAuditLogs.ipAddress,
            createdAt: platformAuditLogs.createdAt,
            actorEmail: users.email,
        })
        .from(platformAuditLogs)
        .leftJoin(users, eq(platformAuditLogs.actorId, users.id))
        .orderBy(desc(platformAuditLogs.createdAt))
        .limit(200);
    return logs;
}

export default async function AuditPage() {
    const session = await getSession();
    if (!session.isLoggedIn || session.role !== 'PLATFORM_ADMIN') redirect('/unauthorized');

    const logs = await getAuditLogs();

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Security Audit Trail</h1>
                <p className="text-slate-400 mt-1">Immutable log of every platform-level administrative action.</p>
            </div>

            <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                <CardHeader><CardTitle>Recent Platform Actions</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 border-y border-slate-700 text-xs text-slate-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Timestamp</th>
                                    <th className="px-6 py-4">Actor</th>
                                    <th className="px-6 py-4">Action</th>
                                    <th className="px-6 py-4">Details</th>
                                    <th className="px-6 py-4">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {logs.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No audit events recorded yet.</td></tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(log.createdAt).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-white">{log.actorEmail || 'System'}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                {log.actionType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-xs max-w-xs truncate">{log.metadata}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{log.ipAddress}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
