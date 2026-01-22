'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Appointment {
    id: string;
    parentName: string;
    studentName: string;
    class: string;
    teacherName: string;
    subject?: string;
    date: string;
    time: string;
    duration: number; // minutes
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    purpose: string;
    notes?: string;
}

const mockAppointments: Appointment[] = [
    { id: 'ap1', parentName: 'Mr. Sharma', studentName: 'Aarav Sharma', class: '10-A', teacherName: 'Rajesh Kumar', subject: 'Mathematics', date: '2026-01-22', time: '10:00', duration: 30, status: 'SCHEDULED', purpose: 'Discuss exam preparation' },
    { id: 'ap2', parentName: 'Mrs. Patel', studentName: 'Priya Patel', class: '12-B', teacherName: 'Dr. Anita Sharma', date: '2026-01-22', time: '11:00', duration: 30, status: 'SCHEDULED', purpose: 'Career counseling' },
    { id: 'ap3', parentName: 'Mr. Singh', studentName: 'Arjun Singh', class: '11-A', teacherName: 'Kavita Nair', subject: 'English', date: '2026-01-23', time: '09:30', duration: 20, status: 'SCHEDULED', purpose: 'Progress review' },
    { id: 'ap4', parentName: 'Mrs. Gupta', studentName: 'Ananya Gupta', class: '9-C', teacherName: 'Suresh Menon', subject: 'Physics', date: '2026-01-21', time: '14:00', duration: 30, status: 'COMPLETED', purpose: 'Discuss improvement areas', notes: 'Recommended extra practice' },
    { id: 'ap5', parentName: 'Mr. Reddy', studentName: 'Vivaan Reddy', class: '11-B', teacherName: 'Rajesh Kumar', subject: 'Mathematics', date: '2026-01-20', time: '15:00', duration: 30, status: 'NO_SHOW', purpose: 'Performance discussion' },
];

const timeSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00'];

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState(mockAppointments);
    const [showScheduleDialog, setShowScheduleDialog] = useState(false);
    const [filter, setFilter] = useState<'ALL' | 'SCHEDULED' | 'COMPLETED'>('ALL');

    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = appointments.filter(a => a.date === today).length;
    const scheduledCount = appointments.filter(a => a.status === 'SCHEDULED').length;
    const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

    const filteredAppointments = appointments.filter(a =>
        filter === 'ALL' || a.status === filter
    ).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    const getStatusBadge = (status: Appointment['status']) => {
        const colors: Record<string, string> = {
            SCHEDULED: 'bg-blue-100 text-blue-700',
            COMPLETED: 'bg-green-100 text-green-700',
            CANCELLED: 'bg-gray-100 text-gray-700',
            NO_SHOW: 'bg-red-100 text-red-700',
        };
        return <Badge className={colors[status]}>{status.replace('_', ' ')}</Badge>;
    };

    const handleComplete = (id: string) => {
        setAppointments(prev => prev.map(a =>
            a.id === id ? { ...a, status: 'COMPLETED' as const } : a
        ));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Parent-Teacher Appointments</h1>
                    <p className="text-gray-600 mt-1">Schedule and manage PTM meetings</p>
                </div>
                <button
                    onClick={() => setShowScheduleDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Schedule Appointment
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total</div>
                        <div className="text-2xl font-bold text-blue-600">{appointments.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Today</div>
                        <div className="text-2xl font-bold text-purple-600">{todayAppointments}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('SCHEDULED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Upcoming</div>
                        <div className="text-2xl font-bold text-orange-600">{scheduledCount}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('COMPLETED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Completed</div>
                        <div className="text-2xl font-bold text-green-600">{completedCount}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Appointments List */}
            <Card>
                <CardHeader>
                    <CardTitle>Appointments ({filter === 'ALL' ? 'All' : filter})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredAppointments.map(apt => (
                                <tr key={apt.id} className={`hover:bg-gray-50 ${apt.date === today ? 'bg-blue-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{new Date(apt.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                                        <div className="text-sm text-gray-500">{apt.time} ({apt.duration} min)</div>
                                    </td>
                                    <td className="px-4 py-3 font-medium">{apt.parentName}</td>
                                    <td className="px-4 py-3">
                                        <div>{apt.studentName}</div>
                                        <div className="text-xs text-gray-500">{apt.class}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div>{apt.teacherName}</div>
                                        {apt.subject && <div className="text-xs text-gray-500">{apt.subject}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-sm max-w-48 truncate">{apt.purpose}</td>
                                    <td className="px-4 py-3">{getStatusBadge(apt.status)}</td>
                                    <td className="px-4 py-3">
                                        {apt.status === 'SCHEDULED' && (
                                            <button
                                                onClick={() => handleComplete(apt.id)}
                                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                            >
                                                ✓ Complete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Schedule Dialog */}
            <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Schedule New Appointment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Date</label>
                                <input type="date" className="w-full px-4 py-2 border rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Time Slot</label>
                                <select className="w-full px-4 py-2 border rounded-lg">
                                    {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Student</label>
                            <input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="Search student..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Teacher</label>
                            <select className="w-full px-4 py-2 border rounded-lg">
                                <option value="">Select teacher</option>
                                <option value="t1">Rajesh Kumar - Mathematics</option>
                                <option value="t2">Kavita Nair - English</option>
                                <option value="t3">Suresh Menon - Physics</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Purpose</label>
                            <textarea className="w-full px-4 py-2 border rounded-lg" rows={2} placeholder="Purpose of meeting..." />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowScheduleDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Schedule</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
