'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSubstitutionTeachers, getSubstitutionRequests } from '@/lib/services/timetable/timetable.service';
import { createSubstitutionRequest, approveSubstitutionRequest } from '@/lib/actions/timetable';

const periods = [1, 2, 3, 4, 5, 6, 7, 8];

export default function SubstitutionPage() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [substitutions, setSubstitutions] = useState<any[]>([]);
    const [validationError, setValidationError] = useState('');
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        absentTeacher: '',
        class: '',
        period: 1,
        subject: '',
        substituteTeacher: ''
    });

    const refreshData = () => {
        getSubstitutionTeachers().then(setTeachers).catch(console.error);
        getSubstitutionRequests().then(setSubstitutions).catch(console.error);
    };

    useEffect(() => {
        refreshData();
    }, []);

    const handleCreate = async () => {
        setValidationError('');
        if (!formData.absentTeacher && !formData.subject) {
            setValidationError('Absent teacher and Subject are required');
            return;
        }
        if (!formData.absentTeacher) {
            setValidationError('Absent teacher is required');
            return;
        }
        if (!formData.subject) {
            setValidationError('Subject is required');
            return;
        }

        try {
            await createSubstitutionRequest({
                date: formData.date,
                absentTeacherName: formData.absentTeacher,
                subject: formData.subject,
                period: formData.period,
                substituteTeacherName: formData.substituteTeacher || undefined,
            });
            setShowCreateDialog(false);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                absentTeacher: '',
                class: '',
                period: 1,
                subject: '',
                substituteTeacher: ''
            });
            refreshData();
        } catch (err: any) {
            setValidationError(err.message || 'Failed to create substitution request');
        }
    };

    const handleApprove = async (id: string) => {
        try {
            await approveSubstitutionRequest(id);
            refreshData();
        } catch (err) {
            console.error('Failed to approve', err);
        }
    };

    const absentTeachers = teachers.filter((t: any) => !t.available);
    const availableTeachers = teachers.filter((t: any) => t.available);
    const todayCount = substitutions.filter((s: any) => s.date === new Date().toISOString().split('T')[0]).length;
    const pendingCount = substitutions.filter((s: any) => s.status === 'pending').length;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge className="bg-yellow-500">Pending</Badge>;
            case 'approved':
                return <Badge className="bg-green-500">Approved</Badge>;
            case 'completed':
                return <Badge variant="outline">Completed</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Substitution Management</h1>
                    <p className="text-gray-600 mt-1">Assign substitute teachers for absent staff</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Timetable</Link>
                    <button
                        onClick={() => {
                            setValidationError('');
                            setShowCreateDialog(true);
                        }}
                        data-testid="new-substitution-btn"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        + New Substitution
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-today">
                        <div className="text-sm text-gray-500">Today&apos;s Substitutions</div>
                        <div className="text-2xl font-bold text-blue-600">{todayCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-pending">
                        <div className="text-sm text-gray-500">Pending Approval</div>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-absent">
                        <div className="text-sm text-gray-500">Teachers Absent Today</div>
                        <div className="text-2xl font-bold text-red-600">{absentTeachers.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-available">
                        <div className="text-sm text-gray-500">Available for Substitution</div>
                        <div className="text-2xl font-bold text-green-600">{availableTeachers.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg" data-testid="absent-teachers-card-title">🔴 Absent Teachers Today</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3" data-testid="absent-teachers-list">
                        {absentTeachers.length === 0 ? (
                            <p className="text-gray-500" data-testid="no-absent-msg">No teachers absent today</p>
                        ) : (
                            absentTeachers.map((teacher: any) => (
                                <div key={teacher.id} className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg" data-testid="absent-teacher-item">
                                    <span className="font-medium text-red-700">{teacher.name}</span>
                                    <span className="text-xs text-gray-500">({teacher.subject})</span>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Substitution Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {substitutions.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No substitution requests yet.</p>
                    ) : (
                        <Table data-testid="substitutions-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Absent Teacher</TableHead>
                                    <TableHead>Substitute</TableHead>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {substitutions.map((sub: any) => (
                                    <TableRow key={sub.id} data-testid={`substitution-row-${sub.id}`}>
                                        <TableCell>
                                            <Link href={`/timetable/substitution/detail/${sub.id}`} className="text-blue-600 hover:underline">
                                                {sub.date}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="font-medium text-red-600">
                                            {sub.originalTeacher}
                                            {sub.reason && <span className="text-xs text-gray-500 block font-normal">({sub.reason})</span>}
                                        </TableCell>
                                        <TableCell className="text-green-600">{sub.substitute || 'TBD'}</TableCell>
                                        <TableCell><Badge variant="outline">{sub.class}</Badge></TableCell>
                                        <TableCell>Period {sub.period}</TableCell>
                                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                                        <TableCell>
                                            {sub.status === 'pending' && (
                                                <button
                                                    onClick={() => handleApprove(sub.id)}
                                                    data-testid={`approve-btn-${sub.id}`}
                                                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Substitution Request</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        {validationError && (
                            <div data-testid="validation-error" className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                                {validationError}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium mb-1">Date</label>
                            <input
                                type="date"
                                data-testid="substitution-date-input"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Absent Teacher</label>
                            <select
                                data-testid="absent-teacher-select"
                                value={formData.absentTeacher}
                                onChange={(e) => setFormData({ ...formData, absentTeacher: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                            >
                                <option value="">Select teacher...</option>
                                {teachers.map((t: any) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Subject</label>
                                <input
                                    type="text"
                                    data-testid="subject-input"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="Enter subject..."
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Period</label>
                                <select
                                    data-testid="period-select"
                                    value={formData.period}
                                    onChange={(e) => setFormData({ ...formData, period: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border rounded-lg bg-white"
                                >
                                    {periods.map(p => (
                                        <option key={p} value={p}>Period {p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Substitute Teacher (Optional)</label>
                            <select
                                data-testid="substitute-teacher-select"
                                value={formData.substituteTeacher}
                                onChange={(e) => setFormData({ ...formData, substituteTeacher: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                            >
                                <option value="">Select substitute...</option>
                                {teachers.map((t: any) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="pt-2">
                            <h4 className="text-sm font-medium mb-2">Available Substitutes</h4>
                            <div className="flex flex-wrap gap-2">
                                {availableTeachers.length === 0 ? (
                                    <span className="text-xs text-gray-500 italic">None available</span>
                                ) : (
                                    availableTeachers.map((t: any) => (
                                        <Badge key={t.id} variant="outline" className="bg-green-50">
                                            {t.name}
                                        </Badge>
                                    ))
                                )}
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
                                onClick={handleCreate}
                                data-testid="submit-request-btn"
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
