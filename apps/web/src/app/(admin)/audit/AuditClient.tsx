'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface AuditEvent {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    resource: string;
    resourceId?: string;
    details: string;
    ipAddress: string;
}

const filterAuditEvents = (events: AuditEvent[], filters: { action?: string; user?: string }) => {
    return events.filter(e => {
        if (filters.action && e.action !== filters.action) return false;
        if (filters.user && !e.userName.toLowerCase().includes(filters.user.toLowerCase())) return false;
        return true;
    });
};

const exportAuditToCSV = (events: AuditEvent[]) => {
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Resource', 'Details', 'IP Address'].join(',');
    const rows = events.map(e => [
        e.timestamp, 
        e.userName, 
        e.userRole, 
        e.action, 
        e.resource, 
        `"${e.details?.replace(/"/g, '""') || ''}"`, 
        e.ipAddress
    ].join(','));
    return [headers, ...rows].join('\n');
};

export function AuditClientView({ initialEvents }: { initialEvents: AuditEvent[] }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [actionFilter, setActionFilter] = useState<string>('ALL');
    
    // Stats calculation based on passed live data
    const today = new Date().toISOString().split('T')[0];
    const totalEvents = initialEvents.length;
    const todayEvents = initialEvents.filter(e => e.timestamp.startsWith(today)).length;
    
    // Unique users
    const uniqueUsersSet = new Set(initialEvents.map(e => e.userId));
    const uniqueUsers = uniqueUsersSet.size;

    // Most active user
    const userCounts = initialEvents.reduce((acc, e) => {
        acc[e.userName] = (acc[e.userName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const mostActiveUser = Object.keys(userCounts).length > 0 
        ? Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0][0] 
        : 'N/A';

    // Top action
    const actionCounts = initialEvents.reduce((acc, e) => {
        acc[e.action] = (acc[e.action] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topAction = Object.keys(actionCounts).length > 0
        ? Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0][0]
        : 'N/A';

    const filteredEvents = filterAuditEvents(initialEvents, {
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
        user: searchQuery || undefined,
    });

    const handleExport = () => {
        const csv = exportAuditToCSV(filteredEvents);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const getActionBadge = (action: string) => {
        const config: Record<string, { color: string; icon: string }> = {
            CREATE: { color: 'bg-green-100 text-green-700', icon: '➕' }, 
            UPDATE: { color: 'bg-blue-100 text-blue-700', icon: '✏️' },
            DELETE: { color: 'bg-red-100 text-red-700', icon: '🗑️' }, 
            VIEW: { color: 'bg-gray-100 text-gray-700', icon: '👁️' },
            EXPORT: { color: 'bg-purple-100 text-purple-700', icon: '📤' }, 
            LOGIN: { color: 'bg-emerald-100 text-emerald-700', icon: '🔓' }, 
            LOGOUT: { color: 'bg-orange-100 text-orange-700', icon: '🔒' },
            PAYMENT: { color: 'bg-amber-100 text-amber-700', icon: '💳' },
            ROLE_CHANGE: { color: 'bg-pink-100 text-pink-700', icon: '🎭' }
        };
        const active = config[action] || { color: 'bg-gray-100 text-gray-700', icon: '⚡' };
        return <Badge className={active.color}>{active.icon} {action}</Badge>;
    };

    const getRoleBadge = (role: string) => {
        const config: Record<string, string> = { 
            ADMIN: 'bg-red-100 text-red-700', 
            PRINCIPAL: 'bg-purple-100 text-purple-700', 
            ACCOUNTANT: 'bg-blue-100 text-blue-700', 
            TEACHER: 'bg-green-100 text-green-700',
            SYSTEM: 'bg-gray-800 text-white'
        };
        return <Badge className={config[role] || 'bg-gray-100 text-gray-700'}>{role || 'USER'}</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Audit Log</h1><p className="text-gray-600 mt-1">Track all system events</p></div>
                <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">📥 Export CSV</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Events</div><div className="text-2xl font-bold text-blue-600">{totalEvents}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Today</div><div className="text-2xl font-bold text-green-600">{todayEvents}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Unique Users</div><div className="text-2xl font-bold text-purple-600">{uniqueUsers}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Most Active</div><div className="text-lg font-bold text-orange-600 truncate">{mostActiveUser}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Top Action</div><div className="text-lg font-bold text-indigo-600">{topAction}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <input type="text" placeholder="Search by user name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 min-w-[250px] px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                    <option value="ALL">All Actions</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                    <option value="VIEW">VIEW</option>
                    <option value="EXPORT">EXPORT</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="LOGOUT">LOGOUT</option>
                    <option value="PAYMENT">PAYMENT</option>
                    <option value="ROLE_CHANGE">ROLE_CHANGE</option>
                </select>
                <div className="text-sm text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">{filteredEvents.length} events showing</div>
            </div>

            <Card className="border-0 shadow-lg ring-1 ring-gray-200">
                <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[600px]">
                        <table className="w-full relative">
                            <thead className="bg-gray-50 border-b sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left w-32">Date</th><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Resource</th><th className="px-4 py-3 text-left">Details</th><th className="px-4 py-3 text-left w-24">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-gray-500">No audit events found matching criteria.</td>
                                    </tr>
                                ) : (
                                    filteredEvents.map(event => (
                                        <tr key={event.id} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-4 py-3 text-sm">
                                                <div className="font-medium text-gray-900">{new Date(event.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                                <div className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleTimeString('en-IN')}</div>
                                            </td>
                                            <td className="px-4 py-3 font-medium">{event.userName}</td>
                                            <td className="px-4 py-3">{getRoleBadge(event.userRole)}</td>
                                            <td className="px-4 py-3">{getActionBadge(event.action)}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{event.resource}</div>
                                                {event.resourceId && <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-[120px]" title={event.resourceId}>{event.resourceId}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">{event.details || '-'}</td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{event.ipAddress || '-'}</td>
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
