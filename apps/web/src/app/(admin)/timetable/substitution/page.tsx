'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getSubstitutionTeachers, getSubstitutionRequests } from '@/lib/actions/scaffolding-bridge';

const periods = [1, 2, 3, 4, 5, 6, 7, 8];

export default function SubstitutionPage() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [substitutions, setSubstitutions] = useState<any[]>([]);
    const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], absentTeacher: '', class: '', period: 1, subject: '' });

    useEffect(() => {
        getSubstitutionTeachers().then(setTeachers);
        getSubstitutionRequests().then(setSubstitutions);
    }, []);

    const absentTeachers = teachers.filter((t: any) => !t.available);
    const availableTeachers = teachers.filter((t: any) => t.available);
    const todayCount = substitutions.filter((s: any) => s.date === new Date().toISOString().split('T')[0]).length;
    const pendingCount = substitutions.filter((s: any) => s.status === 'pending').length;

    const getStatusBadge = (status: string) => {
        switch (status) { case 'pending': return <Badge className="bg-yellow-500">Pending</Badge>; case 'approved': return <Badge className="bg-green-500">Approved</Badge>; case 'completed': return <Badge variant="outline">Completed</Badge>; default: return <Badge variant="outline">{status}</Badge>; }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Substitution Management</h1><p className="text-gray-600 mt-1">Assign substitute teachers for absent staff</p></div>
                <div className="flex gap-3">
                    <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Timetable</Link>
                    <button onClick={() => setShowCreateDialog(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Substitution</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Today&apos;s Substitutions</div><div className="text-2xl font-bold text-blue-600">{todayCount}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending Approval</div><div className="text-2xl font-bold text-yellow-600">{pendingCount}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Teachers Absent Today</div><div className="text-2xl font-bold text-red-600">{absentTeachers.length}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Available for Substitution</div><div className="text-2xl font-bold text-green-600">{availableTeachers.length}</div></CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-lg">🔴 Absent Teachers Today</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {absentTeachers.length === 0 ? <p className="text-gray-500">No teachers absent today</p> : (
                            absentTeachers.map((teacher: any) => (
                                <div key={teacher.id} className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg">
                                    <span className="font-medium">{teacher.name}</span>
                                    <span className="text-xs text-gray-500">({teacher.subject})</span>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-lg">Substitution Requests</CardTitle></CardHeader>
                <CardContent>
                    {substitutions.length === 0 ? <p className="text-gray-500 text-center py-8">No substitution requests yet.</p> : (
                        <table className="w-full">
                            <thead className="bg-gray-50"><tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absent Teacher</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Substitute</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr></thead>
                            <tbody className="divide-y">
                                {substitutions.map((sub: any) => (
                                    <tr key={sub.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">{sub.date}</td>
                                        <td className="px-4 py-3 font-medium text-red-600">{sub.originalTeacher}</td>
                                        <td className="px-4 py-3 text-green-600">{sub.substitute || 'TBD'}</td>
                                        <td className="px-4 py-3"><Badge variant="outline">{sub.class}</Badge></td>
                                        <td className="px-4 py-3">Period {sub.period}</td>
                                        <td className="px-4 py-3">{getStatusBadge(sub.status)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create Substitution Request</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div><label className="block text-sm font-medium mb-1">Date</label><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
                        <div><label className="block text-sm font-medium mb-1">Absent Teacher</label>
                            <select value={formData.absentTeacher} onChange={(e) => setFormData({ ...formData, absentTeacher: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                                <option value="">Select teacher...</option>
                                {teachers.map((t: any) => (<option key={t.id} value={t.name}>{t.name}</option>))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium mb-1">Subject</label><input type="text" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} placeholder="Enter subject..." className="w-full px-3 py-2 border rounded-lg" /></div>
                            <div><label className="block text-sm font-medium mb-1">Period</label>
                                <select value={formData.period} onChange={(e) => setFormData({ ...formData, period: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg">
                                    {periods.map(p => (<option key={p} value={p}>Period {p}</option>))}
                                </select>
                            </div>
                        </div>
                        <div className="pt-4"><h4 className="text-sm font-medium mb-2">Available Substitutes</h4>
                            <div className="flex flex-wrap gap-2">{availableTeachers.map((t: any) => (<Badge key={t.id} variant="outline" className="bg-green-50">{t.name}</Badge>))}</div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Request</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
