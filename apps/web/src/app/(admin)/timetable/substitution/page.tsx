'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Teacher {
    id: string;
    name: string;
    subjects: string[];
    available: boolean;
}

interface SubstitutionRequest {
    id: string;
    date: string;
    absentTeacher: string;
    substituteTeacher: string;
    class: string;
    period: number;
    subject: string;
    status: 'pending' | 'approved' | 'completed';
}

// Mock teachers
const mockTeachers: Teacher[] = [
    { id: 't1', name: 'Dr. Anita Sharma', subjects: ['Mathematics', 'Physics'], available: true },
    { id: 't2', name: 'Mr. Rajesh Kumar', subjects: ['English', 'Hindi'], available: true },
    { id: 't3', name: 'Mrs. Priya Patel', subjects: ['Science', 'Biology'], available: false },
    { id: 't4', name: 'Mr. Suresh Menon', subjects: ['Social Studies', 'History'], available: true },
    { id: 't5', name: 'Ms. Kavita Nair', subjects: ['Mathematics', 'Computer Science'], available: true },
    { id: 't6', name: 'Mr. Arun Verma', subjects: ['English', 'Literature'], available: false },
    { id: 't7', name: 'Mrs. Deepa Singh', subjects: ['Science', 'Chemistry'], available: true },
    { id: 't8', name: 'Mr. Vijay Reddy', subjects: ['Physical Education'], available: true },
];

// Mock substitution requests
const mockSubstitutions: SubstitutionRequest[] = [
    { id: 's1', date: '2026-01-22', absentTeacher: 'Mrs. Priya Patel', substituteTeacher: 'Mrs. Deepa Singh', class: '10-A', period: 3, subject: 'Science', status: 'approved' },
    { id: 's2', date: '2026-01-22', absentTeacher: 'Mr. Arun Verma', substituteTeacher: 'Mr. Rajesh Kumar', class: '8-B', period: 5, subject: 'English', status: 'approved' },
    { id: 's3', date: '2026-01-22', absentTeacher: 'Mrs. Priya Patel', substituteTeacher: 'Dr. Anita Sharma', class: '9-C', period: 6, subject: 'Biology', status: 'pending' },
    { id: 's4', date: '2026-01-21', absentTeacher: 'Mr. Vijay Reddy', substituteTeacher: 'Mr. Suresh Menon', class: '7-A', period: 4, subject: 'Physical Education', status: 'completed' },
];

const classes = ['1-A', '1-B', '2-A', '2-B', '3-A', '3-B', '4-A', '4-B', '5-A', '5-B', '6-A', '6-B', '7-A', '7-B', '8-A', '8-B', '9-A', '9-B', '9-C', '10-A', '10-B', '10-C', '11-A', '11-B', '12-A', '12-B'];
const periods = [1, 2, 3, 4, 5, 6, 7, 8];

export default function SubstitutionPage() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [substitutions, setSubstitutions] = useState(mockSubstitutions);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        absentTeacher: '',
        class: '',
        period: 1,
        subject: '',
    });

    const absentTeachers = mockTeachers.filter(t => !t.available);
    const availableTeachers = mockTeachers.filter(t => t.available);

    const handleCreateSubstitution = () => {
        if (!formData.absentTeacher || !formData.class || !formData.subject) return;

        const newSub: SubstitutionRequest = {
            id: `s${substitutions.length + 1}`,
            date: formData.date,
            absentTeacher: formData.absentTeacher,
            substituteTeacher: availableTeachers[0]?.name || 'TBD',
            class: formData.class,
            period: formData.period,
            subject: formData.subject,
            status: 'pending',
        };

        setSubstitutions([newSub, ...substitutions]);
        setShowCreateDialog(false);
        setFormData({ date: new Date().toISOString().split('T')[0], absentTeacher: '', class: '', period: 1, subject: '' });
    };

    const getStatusBadge = (status: SubstitutionRequest['status']) => {
        switch (status) {
            case 'pending': return <Badge className="bg-yellow-500">Pending</Badge>;
            case 'approved': return <Badge className="bg-green-500">Approved</Badge>;
            case 'completed': return <Badge variant="outline">Completed</Badge>;
        }
    };

    const todayCount = substitutions.filter(s => s.date === '2026-01-22').length;
    const pendingCount = substitutions.filter(s => s.status === 'pending').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Substitution Management</h1>
                    <p className="text-gray-600 mt-1">Assign substitute teachers for absent staff</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        ← Back to Timetable
                    </Link>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        + New Substitution
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Today's Substitutions</div>
                        <div className="text-2xl font-bold text-blue-600">{todayCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Approval</div>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Teachers Absent Today</div>
                        <div className="text-2xl font-bold text-red-600">{absentTeachers.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Available for Substitution</div>
                        <div className="text-2xl font-bold text-green-600">{availableTeachers.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Absent Teachers */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">🔴 Absent Teachers Today</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {absentTeachers.length === 0 ? (
                            <p className="text-gray-500">No teachers absent today</p>
                        ) : (
                            absentTeachers.map(teacher => (
                                <div key={teacher.id} className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg">
                                    <span className="font-medium">{teacher.name}</span>
                                    <span className="text-xs text-gray-500">({teacher.subjects.join(', ')})</span>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Substitutions Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Substitution Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absent Teacher</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Substitute</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {substitutions.map(sub => (
                                <tr key={sub.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{new Date(sub.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td className="px-4 py-3 font-medium text-red-600">{sub.absentTeacher}</td>
                                    <td className="px-4 py-3 text-green-600">{sub.substituteTeacher}</td>
                                    <td className="px-4 py-3"><Badge variant="outline">{sub.class}</Badge></td>
                                    <td className="px-4 py-3">Period {sub.period}</td>
                                    <td className="px-4 py-3">{sub.subject}</td>
                                    <td className="px-4 py-3">{getStatusBadge(sub.status)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Substitution Request</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Absent Teacher</label>
                            <select
                                value={formData.absentTeacher}
                                onChange={(e) => setFormData({ ...formData, absentTeacher: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                <option value="">Select teacher...</option>
                                {mockTeachers.map(t => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Class</label>
                                <select
                                    value={formData.class}
                                    onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value="">Select class...</option>
                                    {classes.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Period</label>
                                <select
                                    value={formData.period}
                                    onChange={(e) => setFormData({ ...formData, period: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    {periods.map(p => (
                                        <option key={p} value={p}>Period {p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Subject</label>
                            <input
                                type="text"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                placeholder="Enter subject..."
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div className="pt-4">
                            <h4 className="text-sm font-medium mb-2">Available Substitutes</h4>
                            <div className="flex flex-wrap gap-2">
                                {availableTeachers.map(t => (
                                    <Badge key={t.id} variant="outline" className="bg-green-50">
                                        {t.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateSubstitution}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Create Request
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
