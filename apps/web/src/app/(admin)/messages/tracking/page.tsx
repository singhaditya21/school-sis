'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getMessageLogs } from '@/lib/actions/messaging';

// The return type of getMessageLogs can be inferred
type MessageLog = Awaited<ReturnType<typeof getMessageLogs>>[number];

export default function MessageTrackingPage() {
    const [messages, setMessages] = useState<MessageLog[]>([]);
    const [filter, setFilter] = useState<MessageLog['status'] | 'ALL'>('ALL');
    const [typeFilter, setTypeFilter] = useState<MessageLog['channel'] | 'ALL'>('ALL');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchMessages = useCallback(async () => {
        try {
            const data = await getMessageLogs();
            setMessages(data);
        } catch (error) {
            console.error('Failed to fetch message logs:', error);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // Polling for real-time updates
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchMessages();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchMessages]);

    const filteredMessages = messages.filter(msg => {
        if (filter !== 'ALL' && msg.status !== filter) return false;
        if (typeFilter !== 'ALL' && msg.channel !== typeFilter) return false;
        return true;
    });

    const stats = {
        total: messages.length,
        delivered: messages.filter(m => m.status === 'DELIVERED').length,
        failed: messages.filter(m => m.status === 'FAILED').length,
        pending: messages.filter(m => m.status === 'QUEUED' || m.status === 'SENT').length,
    };

    const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;

    const getStatusBadge = (status: MessageLog['status']) => {
        const config: Record<MessageLog['status'], { color: string; icon: string }> = {
            QUEUED: { color: 'bg-gray-100 text-gray-700', icon: '⏳' },
            SENT: { color: 'bg-blue-100 text-blue-700', icon: '📤' },
            DELIVERED: { color: 'bg-green-100 text-green-700', icon: '✅' },
            FAILED: { color: 'bg-red-100 text-red-700', icon: '❌' },
        };
        const st = config[status] || { color: 'bg-gray-100 text-gray-700', icon: '❓' };
        return (
            <Badge className={st.color}>
                {st.icon} {status}
            </Badge>
        );
    };

    const getTypeBadge = (type: MessageLog['channel']) => {
        const config: Record<MessageLog['channel'], { color: string; icon: string }> = {
            SMS: { color: 'bg-blue-50 text-blue-700', icon: '📱' },
            WHATSAPP: { color: 'bg-green-50 text-green-700', icon: '💬' },
            EMAIL: { color: 'bg-orange-50 text-orange-700', icon: '📧' },
        };
        const t = config[type] || { color: 'bg-gray-50 text-gray-700', icon: '❓' };
        return (
            <Badge variant="outline" className={t.color}>
                {t.icon} {type}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Message Delivery Tracking</h1>
                    <p className="text-gray-600 mt-1">Real-time SMS, WhatsApp, and Email delivery status</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/messages" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        ← Back to Messages
                    </Link>
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-4 py-2 rounded-lg ${autoRefresh ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
                    >
                        {autoRefresh ? '🔴 Live' : '⏸️ Paused'}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Sent</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Delivered</div>
                        <div className="text-2xl font-bold text-green-600">{stats.delivered}</div>
                        <div className="text-xs text-green-500">{deliveryRate}% rate</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Failed</div>
                        <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Queued/Sent</div>
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
                <div>
                    <label className="text-sm font-medium mr-2">Status:</label>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as typeof filter)}
                        className="px-3 py-2 border rounded-lg"
                    >
                        <option value="ALL">All Status</option>
                        <option value="QUEUED">Queued</option>
                        <option value="SENT">Sent</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium mr-2">Channel:</label>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                        className="px-3 py-2 border rounded-lg"
                    >
                        <option value="ALL">All Channels</option>
                        <option value="SMS">SMS</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="EMAIL">Email</option>
                    </select>
                </div>
                <div className="text-sm text-gray-500">
                    Showing {filteredMessages.length} of {messages.length} messages
                </div>
            </div>

            {/* Messages Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipients</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredMessages.map(msg => (
                                    <tr key={msg.id} className={`hover:bg-gray-50 ${msg.status === 'FAILED' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3">{getTypeBadge(msg.channel)}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm text-gray-700">
                                                {msg.recipients && msg.recipients.length > 0 
                                                    ? msg.recipients.join(', ')
                                                    : 'No recipients'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 max-w-xs truncate text-sm text-gray-600">{msg.message}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {msg.sentAt ? new Date(msg.sentAt).toLocaleString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            }) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {getStatusBadge(msg.status)}
                                            {msg.status === 'FAILED' && msg.failureCount ? (
                                                <div className="text-xs text-red-500 mt-1">Failed ({msg.failureCount}x)</div>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                                {filteredMessages.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                            No messages found.
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
