'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Message {
    id: string;
    type: 'SMS' | 'WHATSAPP' | 'EMAIL';
    recipient: string;
    recipientPhone: string;
    content: string;
    sentAt: string;
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'PENDING';
    deliveredAt?: string;
    readAt?: string;
    errorReason?: string;
}

// Mock messages with delivery status
const generateMockMessages = (): Message[] => {
    const recipients = [
        { name: 'Vinod Sharma', phone: '9876543210' },
        { name: 'Priya Patel', phone: '9876543211' },
        { name: 'Rajesh Kumar', phone: '9876543212' },
        { name: 'Anita Singh', phone: '9876543213' },
        { name: 'Suresh Gupta', phone: '9876543214' },
        { name: 'Kavita Menon', phone: '9876543215' },
        { name: 'Arun Reddy', phone: '9876543216' },
        { name: 'Deepa Nair', phone: '9876543217' },
    ];

    const templates = [
        'Fee reminder: ₹{amount} due on {date}. Pay via: {link}',
        'Your child {name} was marked absent today.',
        'PTM scheduled for {date} at {time}. Please confirm.',
        'Report card for Term 1 is now available.',
        'School will remain closed on {date} due to {reason}.',
    ];

    const statuses: Message['status'][] = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'READ', 'SENT', 'FAILED', 'PENDING'];
    const types: Message['type'][] = ['SMS', 'WHATSAPP', 'EMAIL'];

    return Array.from({ length: 50 }, (_, i) => {
        const recipient = recipients[i % recipients.length];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const sentAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

        return {
            id: `msg-${i + 1}`,
            type,
            recipient: recipient.name,
            recipientPhone: recipient.phone,
            content: templates[Math.floor(Math.random() * templates.length)],
            sentAt: sentAt.toISOString(),
            status,
            deliveredAt: status === 'DELIVERED' || status === 'READ'
                ? new Date(sentAt.getTime() + Math.random() * 60000).toISOString()
                : undefined,
            readAt: status === 'READ'
                ? new Date(sentAt.getTime() + Math.random() * 300000).toISOString()
                : undefined,
            errorReason: status === 'FAILED'
                ? ['Invalid phone number', 'DND activated', 'Network error'][Math.floor(Math.random() * 3)]
                : undefined,
        };
    });
};

export default function MessageTrackingPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [filter, setFilter] = useState<Message['status'] | 'ALL'>('ALL');
    const [typeFilter, setTypeFilter] = useState<Message['type'] | 'ALL'>('ALL');
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        setMessages(generateMockMessages());
    }, []);

    // Simulate real-time updates
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            setMessages(prev => {
                return prev.map(msg => {
                    if (msg.status === 'PENDING' && Math.random() < 0.3) {
                        return { ...msg, status: 'SENT' as const, sentAt: new Date().toISOString() };
                    }
                    if (msg.status === 'SENT' && Math.random() < 0.2) {
                        return { ...msg, status: 'DELIVERED' as const, deliveredAt: new Date().toISOString() };
                    }
                    return msg;
                });
            });
        }, 2000);

        return () => clearInterval(interval);
    }, [autoRefresh]);

    const filteredMessages = messages.filter(msg => {
        if (filter !== 'ALL' && msg.status !== filter) return false;
        if (typeFilter !== 'ALL' && msg.type !== typeFilter) return false;
        return true;
    });

    const stats = {
        total: messages.length,
        delivered: messages.filter(m => m.status === 'DELIVERED' || m.status === 'READ').length,
        read: messages.filter(m => m.status === 'READ').length,
        failed: messages.filter(m => m.status === 'FAILED').length,
        pending: messages.filter(m => m.status === 'PENDING' || m.status === 'SENT').length,
    };

    const deliveryRate = Math.round((stats.delivered / stats.total) * 100);

    const getStatusBadge = (status: Message['status']) => {
        const config: Record<Message['status'], { color: string; icon: string }> = {
            PENDING: { color: 'bg-gray-100 text-gray-700', icon: '⏳' },
            SENT: { color: 'bg-blue-100 text-blue-700', icon: '📤' },
            DELIVERED: { color: 'bg-green-100 text-green-700', icon: '✅' },
            READ: { color: 'bg-purple-100 text-purple-700', icon: '👁️' },
            FAILED: { color: 'bg-red-100 text-red-700', icon: '❌' },
        };
        return (
            <Badge className={config[status].color}>
                {config[status].icon} {status}
            </Badge>
        );
    };

    const getTypeBadge = (type: Message['type']) => {
        const config: Record<Message['type'], { color: string; icon: string }> = {
            SMS: { color: 'bg-blue-50 text-blue-700', icon: '📱' },
            WHATSAPP: { color: 'bg-green-50 text-green-700', icon: '💬' },
            EMAIL: { color: 'bg-orange-50 text-orange-700', icon: '📧' },
        };
        return (
            <Badge variant="outline" className={config[type].color}>
                {config[type].icon} {type}
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                        <div className="text-sm text-gray-500">Read</div>
                        <div className="text-2xl font-bold text-purple-600">{stats.read}</div>
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
                        <div className="text-sm text-gray-500">Pending/Sent</div>
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
                        <option value="PENDING">Pending</option>
                        <option value="SENT">Sent</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="READ">Read</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium mr-2">Type:</label>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                        className="px-3 py-2 border rounded-lg"
                    >
                        <option value="ALL">All Types</option>
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Content</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivered At</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredMessages.slice(0, 20).map(msg => (
                                    <tr key={msg.id} className={`hover:bg-gray-50 ${msg.status === 'FAILED' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3">{getTypeBadge(msg.type)}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{msg.recipient}</div>
                                            <div className="text-xs text-gray-500">{msg.recipientPhone}</div>
                                        </td>
                                        <td className="px-4 py-3 max-w-xs truncate text-sm text-gray-600">{msg.content}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {new Date(msg.sentAt).toLocaleString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {getStatusBadge(msg.status)}
                                            {msg.errorReason && (
                                                <div className="text-xs text-red-500 mt-1">{msg.errorReason}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {msg.deliveredAt ? (
                                                new Date(msg.deliveredAt).toLocaleTimeString('en-IN', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })
                                            ) : '-'}
                                            {msg.readAt && (
                                                <div className="text-xs text-purple-500">
                                                    Read: {new Date(msg.readAt).toLocaleTimeString('en-IN', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </div>
                                            )}
                                        </td>
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
