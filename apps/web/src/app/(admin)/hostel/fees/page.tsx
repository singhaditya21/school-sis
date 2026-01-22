'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HostelService } from '@/lib/services/hostel/hostel.service';
import Link from 'next/link';

interface HostelFee {
    id: string;
    studentId: string;
    studentName: string;
    class: string;
    hostelName: string;
    roomNumber: string;
    feeType: 'hostel' | 'mess' | 'caution';
    amount: number;
    dueDate: string;
    status: 'paid' | 'pending' | 'overdue';
    paidDate?: string;
}

const mockFees: HostelFee[] = [
    { id: 'hf1', studentId: 'STU001', studentName: 'Rahul Sharma', class: 'Class 10-A', hostelName: 'Vivekananda Boys', roomNumber: '101', feeType: 'hostel', amount: 25000, dueDate: '2026-01-15', status: 'paid', paidDate: '2026-01-10' },
    { id: 'hf2', studentId: 'STU001', studentName: 'Rahul Sharma', class: 'Class 10-A', hostelName: 'Vivekananda Boys', roomNumber: '101', feeType: 'mess', amount: 8000, dueDate: '2026-01-15', status: 'paid', paidDate: '2026-01-10' },
    { id: 'hf3', studentId: 'STU002', studentName: 'Amit Kumar', class: 'Class 10-B', hostelName: 'Vivekananda Boys', roomNumber: '101', feeType: 'hostel', amount: 25000, dueDate: '2026-01-15', status: 'pending' },
    { id: 'hf4', studentId: 'STU002', studentName: 'Amit Kumar', class: 'Class 10-B', hostelName: 'Vivekananda Boys', roomNumber: '101', feeType: 'mess', amount: 8000, dueDate: '2026-01-15', status: 'pending' },
    { id: 'hf5', studentId: 'STU003', studentName: 'Priya Patel', class: 'Class 9-A', hostelName: 'Sarojini Girls', roomNumber: 'G01', feeType: 'hostel', amount: 28000, dueDate: '2026-01-10', status: 'overdue' },
    { id: 'hf6', studentId: 'STU003', studentName: 'Priya Patel', class: 'Class 9-A', hostelName: 'Sarojini Girls', roomNumber: 'G01', feeType: 'mess', amount: 8000, dueDate: '2026-01-10', status: 'overdue' },
];

export default function HostelFeesPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [feeTypeFilter, setFeeTypeFilter] = useState('');

    const hostels = HostelService.getHostels();

    const filteredFees = mockFees.filter((f) => {
        if (statusFilter && f.status !== statusFilter) return false;
        if (feeTypeFilter && f.feeType !== feeTypeFilter) return false;
        return true;
    });

    const stats = {
        totalDue: mockFees.filter((f) => f.status !== 'paid').reduce((sum, f) => sum + f.amount, 0),
        collected: mockFees.filter((f) => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0),
        pending: mockFees.filter((f) => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0),
        overdue: mockFees.filter((f) => f.status === 'overdue').reduce((sum, f) => sum + f.amount, 0),
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid':
                return 'bg-green-100 text-green-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'overdue':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getFeeTypeColor = (type: string) => {
        switch (type) {
            case 'hostel':
                return 'bg-blue-100 text-blue-800';
            case 'mess':
                return 'bg-purple-100 text-purple-800';
            case 'caution':
                return 'bg-orange-100 text-orange-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hostel Fees</h1>
                    <p className="text-muted-foreground">Manage hostel and mess fee payments</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/hostel">
                        <Button variant="outline">← Back to Hostel</Button>
                    </Link>
                    <Button>Send Reminders</Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Collected</CardDescription>
                        <CardTitle className="text-3xl text-green-600">₹{stats.collected.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pending</CardDescription>
                        <CardTitle className="text-3xl text-yellow-600">₹{stats.pending.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Overdue</CardDescription>
                        <CardTitle className="text-3xl text-red-600">₹{stats.overdue.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Outstanding</CardDescription>
                        <CardTitle className="text-3xl">₹{stats.totalDue.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex gap-4">
                        <select
                            className="p-2 border rounded-md"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                            <option value="overdue">Overdue</option>
                        </select>
                        <select
                            className="p-2 border rounded-md"
                            value={feeTypeFilter}
                            onChange={(e) => setFeeTypeFilter(e.target.value)}
                        >
                            <option value="">All Fee Types</option>
                            <option value="hostel">Hostel Fee</option>
                            <option value="mess">Mess Fee</option>
                            <option value="caution">Caution Deposit</option>
                        </select>
                        <Button variant="outline" onClick={() => { setStatusFilter(''); setFeeTypeFilter(''); }}>
                            Clear
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Fees Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Fee Records</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-3 px-4">Student</th>
                                <th className="text-left py-3 px-4">Hostel / Room</th>
                                <th className="text-left py-3 px-4">Fee Type</th>
                                <th className="text-left py-3 px-4">Amount</th>
                                <th className="text-left py-3 px-4">Due Date</th>
                                <th className="text-left py-3 px-4">Status</th>
                                <th className="text-left py-3 px-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredFees.map((fee) => (
                                <tr key={fee.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">
                                        <p className="font-medium">{fee.studentName}</p>
                                        <p className="text-sm text-muted-foreground">{fee.studentId} | {fee.class}</p>
                                    </td>
                                    <td className="py-3 px-4">
                                        <p>{fee.hostelName}</p>
                                        <p className="text-sm text-muted-foreground">Room {fee.roomNumber}</p>
                                    </td>
                                    <td className="py-3 px-4">
                                        <Badge className={getFeeTypeColor(fee.feeType)}>
                                            {fee.feeType}
                                        </Badge>
                                    </td>
                                    <td className="py-3 px-4 font-medium">₹{fee.amount.toLocaleString()}</td>
                                    <td className="py-3 px-4">{fee.dueDate}</td>
                                    <td className="py-3 px-4">
                                        <Badge className={getStatusColor(fee.status)}>{fee.status}</Badge>
                                        {fee.paidDate && (
                                            <p className="text-xs text-muted-foreground mt-1">Paid: {fee.paidDate}</p>
                                        )}
                                    </td>
                                    <td className="py-3 px-4">
                                        {fee.status !== 'paid' && (
                                            <div className="flex gap-2">
                                                <Button size="sm">Collect</Button>
                                                <Button size="sm" variant="outline">Remind</Button>
                                            </div>
                                        )}
                                        {fee.status === 'paid' && (
                                            <Button size="sm" variant="outline">Receipt</Button>
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
