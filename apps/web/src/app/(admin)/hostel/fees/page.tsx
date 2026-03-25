'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getHostelFees } from '@/lib/actions/scaffolding-bridge';
import Link from 'next/link';

export default function HostelFeesPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [feeTypeFilter, setFeeTypeFilter] = useState('');
    const [fees, setFees] = useState<any[]>([]);

    useEffect(() => {
        getHostelFees(statusFilter || undefined, feeTypeFilter || undefined).then(setFees);
    }, [statusFilter, feeTypeFilter]);

    const stats = {
        totalDue: fees.filter(f => f.status !== 'paid').reduce((sum: number, f: any) => sum + f.amount, 0),
        collected: fees.filter(f => f.status === 'paid').reduce((sum: number, f: any) => sum + f.amount, 0),
        pending: fees.filter(f => f.status === 'pending').reduce((sum: number, f: any) => sum + f.amount, 0),
        overdue: fees.filter(f => f.status === 'overdue').reduce((sum: number, f: any) => sum + f.amount, 0),
    };

    const getStatusColor = (status: string) => {
        switch (status) { case 'paid': return 'bg-green-100 text-green-800'; case 'pending': return 'bg-yellow-100 text-yellow-800'; case 'overdue': return 'bg-red-100 text-red-800'; default: return 'bg-gray-100 text-gray-800'; }
    };
    const getFeeTypeColor = (type: string) => {
        switch (type) { case 'hostel': return 'bg-blue-100 text-blue-800'; case 'mess': return 'bg-purple-100 text-purple-800'; case 'caution': return 'bg-orange-100 text-orange-800'; default: return 'bg-gray-100 text-gray-800'; }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold tracking-tight">Hostel Fees</h1><p className="text-muted-foreground">Manage hostel and mess fee payments</p></div>
                <div className="flex gap-2"><Link href="/hostel"><Button variant="outline">← Back to Hostel</Button></Link><Button>Send Reminders</Button></div>
            </div>
            <div className="grid grid-cols-4 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Collected</CardDescription><CardTitle className="text-3xl text-green-600">₹{stats.collected.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Pending</CardDescription><CardTitle className="text-3xl text-yellow-600">₹{stats.pending.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Overdue</CardDescription><CardTitle className="text-3xl text-red-600">₹{stats.overdue.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Total Outstanding</CardDescription><CardTitle className="text-3xl">₹{stats.totalDue.toLocaleString()}</CardTitle></CardHeader></Card>
            </div>
            <Card><CardContent className="p-4"><div className="flex gap-4">
                <select className="p-2 border rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option>
                </select>
                <select className="p-2 border rounded-md" value={feeTypeFilter} onChange={(e) => setFeeTypeFilter(e.target.value)}>
                    <option value="">All Fee Types</option><option value="hostel">Hostel Fee</option><option value="mess">Mess Fee</option><option value="caution">Caution Deposit</option>
                </select>
                <Button variant="outline" onClick={() => { setStatusFilter(''); setFeeTypeFilter(''); }}>Clear</Button>
            </div></CardContent></Card>
            <Card>
                <CardHeader><CardTitle>Fee Records</CardTitle></CardHeader>
                <CardContent>
                    {fees.length === 0 ? <p className="text-gray-500 text-center py-8">No fee records found.</p> : (
                    <table className="w-full"><thead><tr className="border-b">
                        <th className="text-left py-3 px-4">Student</th><th className="text-left py-3 px-4">Hostel / Room</th>
                        <th className="text-left py-3 px-4">Fee Type</th><th className="text-left py-3 px-4">Amount</th>
                        <th className="text-left py-3 px-4">Due Date</th><th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Actions</th>
                    </tr></thead><tbody>
                        {fees.map((fee: any) => (
                            <tr key={fee.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4"><p className="font-medium">{fee.studentName}</p><p className="text-sm text-muted-foreground">{fee.studentId} | {fee.class}</p></td>
                                <td className="py-3 px-4"><p>{fee.hostelName}</p><p className="text-sm text-muted-foreground">Room {fee.roomNumber}</p></td>
                                <td className="py-3 px-4"><Badge className={getFeeTypeColor(fee.feeType)}>{fee.feeType}</Badge></td>
                                <td className="py-3 px-4 font-medium">₹{fee.amount.toLocaleString()}</td>
                                <td className="py-3 px-4">{fee.dueDate}</td>
                                <td className="py-3 px-4"><Badge className={getStatusColor(fee.status)}>{fee.status}</Badge>{fee.paidDate && (<p className="text-xs text-muted-foreground mt-1">Paid: {fee.paidDate}</p>)}</td>
                                <td className="py-3 px-4">{fee.status !== 'paid' && (<div className="flex gap-2"><Button size="sm">Collect</Button><Button size="sm" variant="outline">Remind</Button></div>)}{fee.status === 'paid' && (<Button size="sm" variant="outline">Receipt</Button>)}</td>
                            </tr>
                        ))}
                    </tbody></table>)}
                </CardContent>
            </Card>
        </div>
    );
}
