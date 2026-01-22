'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DiaryEntry {
    id: string;
    title: string;
    content: string;
    type: 'CIRCULAR' | 'ANNOUNCEMENT' | 'REMINDER' | 'EVENT';
    targetAudience: 'ALL' | 'PARENTS' | 'STUDENTS' | 'TEACHERS';
    targetClasses?: string[];
    publishedAt: string;
    publishedBy: string;
    isImportant: boolean;
    attachments?: string[];
}

const mockDiaryEntries: DiaryEntry[] = [
    { id: 'd1', title: 'Republic Day Celebration', content: 'School will celebrate Republic Day on 26th January 2026. All students are required to wear white dress. Parents are invited to attend the flag hoisting ceremony at 8:30 AM.', type: 'EVENT', targetAudience: 'ALL', publishedAt: '2026-01-22T08:00:00Z', publishedBy: 'Admin', isImportant: true },
    { id: 'd2', title: 'PTM Schedule - January', content: 'Parent-Teacher Meeting for Classes 9-12 will be held on 25th January 2026, Saturday. Timings: 9 AM to 1 PM. Please collect your appointment slip from class teacher.', type: 'CIRCULAR', targetAudience: 'PARENTS', targetClasses: ['9', '10', '11', '12'], publishedAt: '2026-01-20T10:00:00Z', publishedBy: 'Admin', isImportant: true },
    { id: 'd3', title: 'Term 2 Exam Date Sheet', content: 'Term 2 examinations will commence from 15th February 2026. Detailed date sheet has been uploaded on the school website. Students are advised to start their preparations.', type: 'ANNOUNCEMENT', targetAudience: 'STUDENTS', publishedAt: '2026-01-18T09:00:00Z', publishedBy: 'Exam Cell', isImportant: false },
    { id: 'd4', title: 'Fee Payment Reminder', content: 'This is a reminder that Term 2 fees are due by 31st January 2026. Late fee of ₹50/day will be applicable after the due date.', type: 'REMINDER', targetAudience: 'PARENTS', publishedAt: '2026-01-15T11:00:00Z', publishedBy: 'Accounts', isImportant: true },
    { id: 'd5', title: 'Sports Day Practice', content: 'Sports Day practice will be held daily from 3:30 PM to 5:00 PM. Selected students should report to the sports ground with proper sports attire.', type: 'ANNOUNCEMENT', targetAudience: 'STUDENTS', publishedAt: '2026-01-12T14:00:00Z', publishedBy: 'Sports Dept', isImportant: false },
];

export default function DiaryPage() {
    const [entries, setEntries] = useState(mockDiaryEntries);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [filter, setFilter] = useState<'ALL' | 'CIRCULAR' | 'ANNOUNCEMENT' | 'EVENT' | 'REMINDER'>('ALL');

    const filteredEntries = entries.filter(e => filter === 'ALL' || e.type === filter);

    const getTypeBadge = (type: DiaryEntry['type']) => {
        const colors: Record<string, string> = {
            CIRCULAR: 'bg-blue-100 text-blue-700',
            ANNOUNCEMENT: 'bg-purple-100 text-purple-700',
            REMINDER: 'bg-orange-100 text-orange-700',
            EVENT: 'bg-green-100 text-green-700',
        };
        return <Badge className={colors[type]}>{type}</Badge>;
    };

    const getAudienceBadge = (audience: DiaryEntry['targetAudience']) => {
        const config: Record<string, { color: string; icon: string }> = {
            ALL: { color: 'bg-gray-100 text-gray-700', icon: '👥' },
            PARENTS: { color: 'bg-pink-100 text-pink-700', icon: '👨‍👩‍👧' },
            STUDENTS: { color: 'bg-blue-100 text-blue-700', icon: '🎓' },
            TEACHERS: { color: 'bg-green-100 text-green-700', icon: '👨‍🏫' },
        };
        return <Badge className={config[audience].color}>{config[audience].icon} {audience}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Digital Diary</h1>
                    <p className="text-gray-600 mt-1">Circulars, announcements, and reminders</p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Create Entry
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {(['ALL', 'CIRCULAR', 'ANNOUNCEMENT', 'EVENT', 'REMINDER'] as const).map(type => (
                    <button
                        key={type}
                        onClick={() => setFilter(type)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === type ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Entries */}
            <div className="space-y-4">
                {filteredEntries.map(entry => (
                    <Card key={entry.id} className={entry.isImportant ? 'border-l-4 border-l-red-500' : ''}>
                        <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        {getTypeBadge(entry.type)}
                                        {getAudienceBadge(entry.targetAudience)}
                                        {entry.isImportant && <Badge className="bg-red-100 text-red-700">⚠️ Important</Badge>}
                                    </div>
                                    <h3 className="text-lg font-semibold">{entry.title}</h3>
                                    <p className="text-gray-600 mt-2">{entry.content}</p>
                                    <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                                        <span>📅 {new Date(entry.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        <span>👤 {entry.publishedBy}</span>
                                        {entry.targetClasses && (
                                            <span>🏫 Classes: {entry.targetClasses.join(', ')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create Diary Entry</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Title</label>
                            <input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="Entry title" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Type</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    <option value="CIRCULAR">Circular</option>
                                    <option value="ANNOUNCEMENT">Announcement</option>
                                    <option value="EVENT">Event</option>
                                    <option value="REMINDER">Reminder</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Target Audience</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    <option value="ALL">Everyone</option>
                                    <option value="PARENTS">Parents Only</option>
                                    <option value="STUDENTS">Students Only</option>
                                    <option value="TEACHERS">Teachers Only</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Content</label>
                            <textarea className="w-full px-4 py-2 border rounded-lg" rows={4} placeholder="Enter message content..." />
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="important" />
                            <label htmlFor="important" className="text-sm">Mark as Important</label>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Publish</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
