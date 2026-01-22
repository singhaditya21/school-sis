'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    mockAuditEvents,
    getAuditStats,
    filterAuditEvents,
    exportAuditToCSV,
    type AuditEvent
} from '@/lib/services/audit/audit.service';

export default function AuditPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [actionFilter, setActionFilter] = useState<string>('ALL');
    const stats = getAuditStats();

    const filteredEvents = filterAuditEvents(mockAuditEvents, {
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

    const getActionBadge = (action: AuditEvent['action']) => {
        const config: Record<string, { color: string; icon: string }> = {
            CREATE: { color: 'bg-green-100 text-green-700', icon: '➕' },
            UPDATE: { color: 'bg-blue-100 text-blue-700', icon: '✏️' },
            DELETE: { color: 'bg-red-100 text-red-700', icon: '🗑️' },
            VIEW: { color: 'bg-gray-100 text-gray-700', icon: '👁️' },
            EXPORT: { color: 'bg-purple-100 text-purple-700', icon: '📤' },
            LOGIN: { color: 'bg-emerald-100 text-emerald-700', icon: '🔓' },
            LOGOUT: { color: 'bg-orange-100 text-orange-700', icon: '🔒' },
        };
        return <Badge className={config[action]?.color}>{config[action]?.icon} {action}</Badge>;
    };

    const getRoleBadge = (role: string) => {
        const config: Record<string, string> = {
            ADMIN: 'bg-red-100 text-red-700',
            PRINCIPAL: 'bg-purple-100 text-purple-700',
            ACCOUNTANT: 'bg-blue-100 text-blue-700',
            TEACHER: 'bg-green-100 text-green-700',
        };
        return <Badge className={config[role] || 'bg-gray-100'}>{role}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Audit Log</h1>
                    <p className="text-gray-600 mt-1">Track all user actions and system events</p>
                </div>
                <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                    📥 Export CSV
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Events</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalEvents}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Today</div>
                        <div className="text-2xl font-bold text-green-600">{stats.todayEvents}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Unique Users</div>
                        <div className="text-2xl font-bold text-purple-600">{stats.uniqueUsers}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Most Active</div>
                        <div className="text-lg font-bold text-orange-600 truncate">{stats.mostActiveUser}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Top Action</div>
                        <div className="text-lg font-bold text-indigo-600">{stats.topAction}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center flex-wrap">
                <input
                    type="text"
                    placeholder="Search by user name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-64 px-4 py-2 border rounded-lg"
                />
                <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                >
                    <option value="ALL">All Actions</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                    <option value="VIEW">VIEW</option>
                    <option value="EXPORT">EXPORT</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="LOGOUT">LOGOUT</option>
                </select>
                <div className="text-sm text-gray-500">
                    Showing {filteredEvents.length} events
                </div>
            </div>

            {/* Audit Log Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredEvents.map(event => (
                                    <tr key={event.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm">
                                            <div>{new Date(event.timestamp).toLocaleDateString('en-IN')}</div>
                                            <div className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleTimeString('en-IN')}</div>
                                        </td>
                                        <td className="px-4 py-3 font-medium">{event.userName}</td>
                                        <td className="px-4 py-3">{getRoleBadge(event.userRole)}</td>
                                        <td className="px-4 py-3">{getActionBadge(event.action)}</td>
                                        <td className="px-4 py-3">
                                            <div>{event.resource}</div>
                                            {event.resourceId && (
                                                <div className="text-xs text-gray-500 font-mono">{event.resourceId}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{event.details}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{event.ipAddress}</td>
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
