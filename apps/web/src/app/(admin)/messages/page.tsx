'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface Message {
    id: string;
    type: 'sms' | 'email' | 'whatsapp' | 'push';
    subject: string;
    content: string;
    recipients: number;
    sentAt: string;
    status: 'sent' | 'delivered' | 'failed' | 'pending';
    sentBy: string;
}

const mockMessages: Message[] = [
    { id: '1', type: 'sms', subject: 'Fee Reminder', content: 'Dear Parent, fees for January are due...', recipients: 450, sentAt: '2026-01-22 10:30 AM', status: 'delivered', sentBy: 'Accounts' },
    { id: '2', type: 'email', subject: 'PTM Announcement', content: 'Parent-Teacher meeting scheduled for...', recipients: 1200, sentAt: '2026-01-21 02:15 PM', status: 'delivered', sentBy: 'Admin' },
    { id: '3', type: 'whatsapp', subject: 'Holiday Notice', content: 'School will remain closed on...', recipients: 1500, sentAt: '2026-01-20 09:00 AM', status: 'delivered', sentBy: 'Principal' },
    { id: '4', type: 'push', subject: 'Exam Schedule', content: 'Term 1 exams will begin from...', recipients: 800, sentAt: '2026-01-19 04:00 PM', status: 'sent', sentBy: 'Exam Cell' },
    { id: '5', type: 'sms', subject: 'Bus Route Change', content: 'Route 5 will be diverted due to...', recipients: 75, sentAt: '2026-01-18 08:00 AM', status: 'delivered', sentBy: 'Transport' },
];

export default function MessagesPage() {
    const [typeFilter, setTypeFilter] = useState('');

    const filteredMessages = typeFilter
        ? mockMessages.filter((m) => m.type === typeFilter)
        : mockMessages;

    const stats = {
        total: mockMessages.length,
        sms: mockMessages.filter((m) => m.type === 'sms').length,
        email: mockMessages.filter((m) => m.type === 'email').length,
        whatsapp: mockMessages.filter((m) => m.type === 'whatsapp').length,
    };

    const getTypeIcon = (type: string) => {
        const icons: Record<string, string> = { sms: '📱', email: '📧', whatsapp: '💬', push: '🔔' };
        return icons[type] || '📨';
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            delivered: 'bg-green-100 text-green-800',
            sent: 'bg-blue-100 text-blue-800',
            pending: 'bg-yellow-100 text-yellow-800',
            failed: 'bg-red-100 text-red-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Messaging Center</h1>
                    <p className="text-muted-foreground">Send and track communications</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/messages/templates">
                        <Button variant="outline">📋 Templates</Button>
                    </Link>
                    <Link href="/messages/tracking">
                        <Button variant="outline">📊 Tracking</Button>
                    </Link>
                    <Button>+ New Message</Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Sent</CardDescription>
                        <CardTitle className="text-3xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>📱 SMS</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{stats.sms}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>📧 Email</CardDescription>
                        <CardTitle className="text-3xl text-purple-600">{stats.email}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>💬 WhatsApp</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.whatsapp}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex gap-4">
                        <select
                            className="p-2 border rounded-md"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="">All Types</option>
                            <option value="sms">SMS</option>
                            <option value="email">Email</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="push">Push Notification</option>
                        </select>
                        <Button variant="outline" onClick={() => setTypeFilter('')}>Clear</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Message List */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Messages</CardTitle>
                    <CardDescription>Communication history</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {filteredMessages.map((msg) => (
                            <div key={msg.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl">{getTypeIcon(msg.type)}</span>
                                    <div>
                                        <p className="font-medium">{msg.subject}</p>
                                        <p className="text-sm text-muted-foreground truncate max-w-md">{msg.content}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {msg.sentAt} • by {msg.sentBy}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="font-medium">{msg.recipients}</p>
                                        <p className="text-xs text-muted-foreground">recipients</p>
                                    </div>
                                    <Badge className={getStatusColor(msg.status)}>{msg.status}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
