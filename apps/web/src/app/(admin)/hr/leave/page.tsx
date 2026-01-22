'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mockLeaveRequests, type LeaveRequest } from '@/lib/services/hr/hr.service';

export default function LeavePage() {
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
    const [leaves, setLeaves] = useState(mockLeaveRequests);
    const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

    const filteredLeaves = leaves.filter(l => filter === 'ALL' || l.status === filter);

    const pendingCount = leaves.filter(l => l.status === 'PENDING').length;
    const approvedCount = leaves.filter(l => l.status === 'APPROVED').length;
    const rejectedCount = leaves.filter(l => l.status === 'REJECTED').length;

    const getStatusBadge = (status: LeaveRequest['status']) => {
        const colors: Record<string, string> = {
            PENDING: 'bg-yellow-100 text-yellow-700',
            APPROVED: 'bg-green-100 text-green-700',
            REJECTED: 'bg-red-100 text-red-700',
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    const getTypeBadge = (type: LeaveRequest['leaveType']) => {
        const colors: Record<string, string> = {
            CASUAL: 'bg-blue-100 text-blue-700',
            SICK: 'bg-orange-100 text-orange-700',
            EARNED: 'bg-purple-100 text-purple-700',
            MATERNITY: 'bg-pink-100 text-pink-700',
            PATERNITY: 'bg-indigo-100 text-indigo-700',
            UNPAID: 'bg-gray-100 text-gray-700',
        };
        return <Badge className={colors[type]}>{type}</Badge>;
    };

    const handleApprove = (id: string) => {
        setLeaves(prev => prev.map(l =>
            l.id === id ? { ...l, status: 'APPROVED' as const, approvedBy: 'Admin User' } : l
        ));
        setSelectedLeave(null);
    };

    const handleReject = (id: string) => {
        setLeaves(prev => prev.map(l =>
            l.id === id ? { ...l, status: 'REJECTED' as const, approvedBy: 'Admin User' } : l
        ));
        setSelectedLeave(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Leave Management</h1>
                    <p className="text-gray-600 mt-1">Approve and track leave requests</p>
                </div>
                <Link href="/hr" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                    ← Back to HR
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Requests</div>
                        <div className="text-2xl font-bold text-blue-600">{leaves.length}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer border-2 border-yellow-200" onClick={() => setFilter('PENDING')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending</div>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('APPROVED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Approved</div>
                        <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('REJECTED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Rejected</div>
                        <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Leave Requests Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Leave Requests ({filter === 'ALL' ? 'All' : filter})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredLeaves.map(leave => (
                                <tr key={leave.id} className={`hover:bg-gray-50 ${leave.status === 'PENDING' ? 'bg-yellow-50' : ''}`}>
                                    <td className="px-4 py-3 font-medium">{leave.staffName}</td>
                                    <td className="px-4 py-3">
                                        <Badge variant="outline">{leave.department}</Badge>
                                    </td>
                                    <td className="px-4 py-3">{getTypeBadge(leave.leaveType)}</td>
                                    <td className="px-4 py-3 text-sm">{new Date(leave.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td className="px-4 py-3 text-sm">{new Date(leave.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td className="px-4 py-3 text-center font-semibold">{leave.days}</td>
                                    <td className="px-4 py-3">{getStatusBadge(leave.status)}</td>
                                    <td className="px-4 py-3">
                                        {leave.status === 'PENDING' ? (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleApprove(leave.id)}
                                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() => handleReject(leave.id)}
                                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-500">By {leave.approvedBy}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
