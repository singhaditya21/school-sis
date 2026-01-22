'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Homework {
    id: string;
    subject: string;
    class: string;
    section: string;
    title: string;
    description: string;
    dueDate: string;
    assignedBy: string;
    assignedOn: string;
    attachments?: string[];
    submissionCount: number;
    totalStudents: number;
}

const mockHomework: Homework[] = [
    { id: 'hw1', subject: 'Mathematics', class: '10', section: 'A', title: 'Chapter 5 - Quadratic Equations', description: 'Complete exercises 5.1 to 5.3 from NCERT textbook. Show all working steps.', dueDate: '2026-01-25', assignedBy: 'Rajesh Kumar', assignedOn: '2026-01-21', submissionCount: 12, totalStudents: 40 },
    { id: 'hw2', subject: 'English', class: '10', section: 'A', title: 'Essay Writing', description: 'Write a 500-word essay on "Importance of Digital Literacy in Modern Education".', dueDate: '2026-01-24', assignedBy: 'Kavita Nair', assignedOn: '2026-01-20', submissionCount: 28, totalStudents: 40 },
    { id: 'hw3', subject: 'Physics', class: '11', section: 'B', title: 'Numericals - Laws of Motion', description: 'Solve numerical problems 1-15 from HC Verma Chapter 5.', dueDate: '2026-01-26', assignedBy: 'Suresh Menon', assignedOn: '2026-01-22', submissionCount: 0, totalStudents: 38 },
    { id: 'hw4', subject: 'Chemistry', class: '12', section: 'A', title: 'Organic Chemistry - Reactions', description: 'Complete the reaction mechanism practice sheet shared in class.', dueDate: '2026-01-23', assignedBy: 'Dr. Anita Sharma', assignedOn: '2026-01-20', submissionCount: 35, totalStudents: 36 },
    { id: 'hw5', subject: 'Hindi', class: '9', section: 'C', title: 'पत्र लेखन', description: 'प्रधानाचार्य को छुट्टी के लिए एक औपचारिक पत्र लिखें।', dueDate: '2026-01-24', assignedBy: 'Meera Devi', assignedOn: '2026-01-21', submissionCount: 22, totalStudents: 42 },
];

const classes = ['All', '9', '10', '11', '12'];

export default function HomeworkPage() {
    const [homework, setHomework] = useState(mockHomework);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [classFilter, setClassFilter] = useState('All');

    const filteredHomework = homework.filter(hw =>
        classFilter === 'All' || hw.class === classFilter
    );

    const today = new Date().toISOString().split('T')[0];
    const overdue = homework.filter(hw => hw.dueDate < today).length;
    const pendingSubmissions = homework.reduce((sum, hw) => sum + (hw.totalStudents - hw.submissionCount), 0);

    const getStatusColor = (dueDate: string, submissions: number, total: number) => {
        if (dueDate < today) return 'border-l-red-500';
        if (submissions >= total * 0.8) return 'border-l-green-500';
        if (submissions >= total * 0.5) return 'border-l-yellow-500';
        return 'border-l-blue-500';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Homework Portal</h1>
                    <p className="text-gray-600 mt-1">Assign and track homework submissions</p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Assign Homework
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Active Assignments</div>
                        <div className="text-2xl font-bold text-blue-600">{homework.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Due Today</div>
                        <div className="text-2xl font-bold text-orange-600">{homework.filter(hw => hw.dueDate === today).length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Overdue</div>
                        <div className="text-2xl font-bold text-red-600">{overdue}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Submissions</div>
                        <div className="text-2xl font-bold text-purple-600">{pendingSubmissions}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {classes.map(cls => (
                    <button
                        key={cls}
                        onClick={() => setClassFilter(cls)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${classFilter === cls ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                    >
                        {cls === 'All' ? 'All Classes' : `Class ${cls}`}
                    </button>
                ))}
            </div>

            {/* Homework List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHomework.map(hw => (
                    <Card key={hw.id} className={`border-l-4 ${getStatusColor(hw.dueDate, hw.submissionCount, hw.totalStudents)}`}>
                        <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge className="bg-blue-100 text-blue-700">{hw.subject}</Badge>
                                        <Badge variant="outline">Class {hw.class}-{hw.section}</Badge>
                                    </div>
                                    <h3 className="font-semibold">{hw.title}</h3>
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{hw.description}</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="text-gray-500">
                                        <span>📅 Due: {new Date(hw.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                        <span className="ml-4">👨‍🏫 {hw.assignedBy}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500">Submissions:</span>
                                        <span className={`font-semibold ${hw.submissionCount >= hw.totalStudents * 0.8 ? 'text-green-600' : 'text-orange-600'}`}>
                                            {hw.submissionCount}/{hw.totalStudents}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-2 bg-gray-200 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${hw.submissionCount >= hw.totalStudents * 0.8 ? 'bg-green-500' : 'bg-orange-500'}`}
                                        style={{ width: `${(hw.submissionCount / hw.totalStudents) * 100}%` }}
                                    />
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
                        <DialogTitle>Assign Homework</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Class</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    {['9', '10', '11', '12'].map(c => <option key={c} value={c}>Class {c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Section</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    {['A', 'B', 'C'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Subject</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    <option>Mathematics</option>
                                    <option>Science</option>
                                    <option>English</option>
                                    <option>Hindi</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Title</label>
                            <input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="Homework title" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea className="w-full px-4 py-2 border rounded-lg" rows={3} placeholder="Instructions for students..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Due Date</label>
                            <input type="date" className="w-full px-4 py-2 border rounded-lg" />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Assign</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
