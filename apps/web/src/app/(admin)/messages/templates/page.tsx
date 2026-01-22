'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface MessageTemplate {
    id: string;
    name: string;
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
    subject?: string;
    body: string;
    variables: string[];
    active: boolean;
    usageCount: number;
    lastUsed?: string;
}

const mockTemplates: MessageTemplate[] = [
    {
        id: 't1',
        name: 'Fee Reminder',
        channel: 'SMS',
        body: 'Dear {{parent_name}}, fees of ₹{{amount}} for {{student_name}} ({{class}}) is pending. Please pay by {{due_date}}. -School Admin',
        variables: ['parent_name', 'amount', 'student_name', 'class', 'due_date'],
        active: true,
        usageCount: 1250,
        lastUsed: '2026-01-22',
    },
    {
        id: 't2',
        name: 'Attendance Alert',
        channel: 'WHATSAPP',
        body: '🚨 Attendance Alert\n\nDear {{parent_name}},\n\nYour ward {{student_name}} was marked {{status}} today ({{date}}).\n\nPlease contact class teacher if needed.',
        variables: ['parent_name', 'student_name', 'status', 'date'],
        active: true,
        usageCount: 890,
        lastUsed: '2026-01-22',
    },
    {
        id: 't3',
        name: 'PTM Invitation',
        channel: 'EMAIL',
        subject: 'Parent-Teacher Meeting Scheduled - {{date}}',
        body: 'Dear {{parent_name}},\n\nYou are cordially invited for the Parent-Teacher Meeting scheduled on {{date}} at {{time}}.\n\nStudent: {{student_name}}\nClass: {{class}}\nVenue: {{venue}}\n\nPlease confirm your attendance.\n\nRegards,\nSchool Administration',
        variables: ['parent_name', 'date', 'time', 'student_name', 'class', 'venue'],
        active: true,
        usageCount: 450,
        lastUsed: '2026-01-20',
    },
    {
        id: 't4',
        name: 'Exam Schedule',
        channel: 'SMS',
        body: 'Dear Parent, {{exam_name}} for Class {{class}} starts from {{start_date}}. Timetable shared on app. -School',
        variables: ['exam_name', 'class', 'start_date'],
        active: true,
        usageCount: 320,
        lastUsed: '2026-01-15',
    },
    {
        id: 't5',
        name: 'Holiday Notice',
        channel: 'WHATSAPP',
        body: '📢 Holiday Notice\n\nSchool will remain closed on {{date}} on account of {{reason}}.\n\nClasses resume on {{resume_date}}.\n\n- Administration',
        variables: ['date', 'reason', 'resume_date'],
        active: true,
        usageCount: 200,
        lastUsed: '2026-01-10',
    },
    {
        id: 't6',
        name: 'Report Card Ready',
        channel: 'EMAIL',
        subject: 'Report Card Available - {{student_name}}',
        body: 'Dear {{parent_name}},\n\nThe report card for {{student_name}} ({{class}}) for {{term}} is now available.\n\nPlease login to the parent portal to view and download.\n\nKey Highlights:\n- Overall Percentage: {{percentage}}%\n- Rank in Class: {{rank}}\n\nRegards,\nExamination Cell',
        variables: ['parent_name', 'student_name', 'class', 'term', 'percentage', 'rank'],
        active: false,
        usageCount: 150,
    },
];

export default function MessageTemplatesPage() {
    const [channelFilter, setChannelFilter] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);

    const filteredTemplates = channelFilter
        ? mockTemplates.filter((t) => t.channel === channelFilter)
        : mockTemplates;

    const stats = {
        total: mockTemplates.length,
        sms: mockTemplates.filter((t) => t.channel === 'SMS').length,
        whatsapp: mockTemplates.filter((t) => t.channel === 'WHATSAPP').length,
        email: mockTemplates.filter((t) => t.channel === 'EMAIL').length,
        active: mockTemplates.filter((t) => t.active).length,
    };

    const channelColors: Record<string, string> = {
        SMS: 'bg-blue-100 text-blue-700',
        WHATSAPP: 'bg-green-100 text-green-700',
        EMAIL: 'bg-purple-100 text-purple-700',
    };

    const channelIcons: Record<string, string> = {
        SMS: '📱',
        WHATSAPP: '💬',
        EMAIL: '📧',
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Message Templates</h1>
                    <p className="text-muted-foreground">Manage SMS, WhatsApp, and Email templates</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/messages">
                        <Button variant="outline">← Back to Messages</Button>
                    </Link>
                    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                        <DialogTrigger asChild>
                            <Button>+ New Template</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Create New Template</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium">Template Name</label>
                                        <Input placeholder="e.g., Fee Reminder" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Channel</label>
                                        <select className="w-full p-2 border rounded-md">
                                            <option value="SMS">SMS</option>
                                            <option value="WHATSAPP">WhatsApp</option>
                                            <option value="EMAIL">Email</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Subject (Email only)</label>
                                    <Input placeholder="Email subject line" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Message Body</label>
                                    <textarea
                                        className="w-full p-3 border rounded-md h-32"
                                        placeholder="Use {{variable_name}} for dynamic content"
                                    />
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg text-sm">
                                    <p className="font-medium mb-1">Available Variables:</p>
                                    <p className="text-muted-foreground">
                                        {'{{student_name}}, {{parent_name}}, {{class}}, {{amount}}, {{date}}, {{time}}'}
                                    </p>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                                    <Button>Save Template</Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Templates</CardDescription>
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
                        <CardDescription>💬 WhatsApp</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.whatsapp}</CardTitle>
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
                        <CardDescription>Active</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex gap-4">
                        <select
                            className="p-2 border rounded-md"
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value)}
                        >
                            <option value="">All Channels</option>
                            <option value="SMS">SMS</option>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="EMAIL">Email</option>
                        </select>
                        <Button variant="outline" onClick={() => setChannelFilter('')}>Clear</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Template Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map((template) => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">{template.name}</CardTitle>
                                <Badge className={channelColors[template.channel]}>
                                    {channelIcons[template.channel]} {template.channel}
                                </Badge>
                            </div>
                            {template.subject && (
                                <CardDescription className="truncate">Subject: {template.subject}</CardDescription>
                            )}
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground line-clamp-3 mb-4 whitespace-pre-line">
                                {template.body}
                            </p>
                            <div className="flex flex-wrap gap-1 mb-4">
                                {template.variables.slice(0, 4).map((v) => (
                                    <Badge key={v} variant="outline" className="text-xs">
                                        {`{{${v}}}`}
                                    </Badge>
                                ))}
                                {template.variables.length > 4 && (
                                    <Badge variant="outline" className="text-xs">+{template.variables.length - 4}</Badge>
                                )}
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs ${template.active ? 'text-green-600' : 'text-gray-400'}`}>
                                        {template.active ? '● Active' : '○ Inactive'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Used {template.usageCount}x
                                    </span>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => setSelectedTemplate(template)}>
                                    View
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Template Detail Dialog */}
            {selectedTemplate && (
                <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {selectedTemplate.name}
                                <Badge className={channelColors[selectedTemplate.channel]}>
                                    {selectedTemplate.channel}
                                </Badge>
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {selectedTemplate.subject && (
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Subject</p>
                                    <p className="p-2 bg-gray-50 rounded">{selectedTemplate.subject}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Message Body</p>
                                <pre className="p-3 bg-gray-50 rounded whitespace-pre-wrap text-sm">
                                    {selectedTemplate.body}
                                </pre>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">Variables</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTemplate.variables.map((v) => (
                                        <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t text-sm">
                                <span>Used {selectedTemplate.usageCount} times</span>
                                {selectedTemplate.lastUsed && <span>Last: {selectedTemplate.lastUsed}</span>}
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline">Edit Template</Button>
                                <Button>Use Template</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
