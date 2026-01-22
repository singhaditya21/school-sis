'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { VisitorService, Visitor } from '@/lib/services/visitor/visitor.service';

export default function VisitorsPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [purposeFilter, setPurposeFilter] = useState('');
    const [showCheckInDialog, setShowCheckInDialog] = useState(false);
    const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

    const stats = VisitorService.getStats();
    const visitors = VisitorService.getVisitors({
        status: statusFilter || undefined,
        purpose: purposeFilter || undefined,
    });
    const purposes = VisitorService.getPurposeOptions();
    const departments = VisitorService.getDepartments();
    const idProofTypes = VisitorService.getIDProofTypes();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'checked_in':
                return 'bg-green-100 text-green-800';
            case 'checked_out':
                return 'bg-gray-100 text-gray-800';
            case 'pre_approved':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getPurposeColor = (purpose: string) => {
        const colors: Record<string, string> = {
            meeting: 'bg-purple-100 text-purple-800',
            admission: 'bg-blue-100 text-blue-800',
            delivery: 'bg-orange-100 text-orange-800',
            interview: 'bg-indigo-100 text-indigo-800',
            parent_visit: 'bg-green-100 text-green-800',
            vendor: 'bg-yellow-100 text-yellow-800',
            other: 'bg-gray-100 text-gray-800',
        };
        return colors[purpose] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Visitor Management</h1>
                    <p className="text-muted-foreground">Track and manage campus visitors</p>
                </div>
                <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
                    <DialogTrigger asChild>
                        <Button>+ New Check-In</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Visitor Check-In</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">Visitor Name *</label>
                                    <Input placeholder="Full Name" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Phone Number *</label>
                                    <Input placeholder="10-digit mobile" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Email</label>
                                    <Input placeholder="email@example.com" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Company/Organization</label>
                                    <Input placeholder="Company name (if any)" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Purpose of Visit *</label>
                                    <select className="w-full p-2 border rounded-md">
                                        <option value="">Select Purpose</option>
                                        {purposes.map((p) => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Host Department *</label>
                                    <select className="w-full p-2 border rounded-md">
                                        <option value="">Select Department</option>
                                        {departments.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Host Name *</label>
                                    <Input placeholder="Person to meet" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">ID Proof Type *</label>
                                    <select className="w-full p-2 border rounded-md">
                                        <option value="">Select ID Proof</option>
                                        {idProofTypes.map((id) => (
                                            <option key={id} value={id}>{id}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">ID Number (Last 4 digits)</label>
                                    <Input placeholder="****1234" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Vehicle Number</label>
                                    <Input placeholder="DL-01-AB-1234" />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Purpose Details</label>
                                <textarea className="w-full p-2 border rounded-md" rows={2} placeholder="Brief description of visit" />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => setShowCheckInDialog(false)}>Cancel</Button>
                                <Button>Check In & Print Pass</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Today's Total</CardDescription>
                        <CardTitle className="text-3xl">{stats.todayTotal}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Currently In</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.currentlyIn}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Checked Out</CardDescription>
                        <CardTitle className="text-3xl text-gray-600">{stats.checkedOut}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pre-Approved</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{stats.preApproved}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Avg Duration</CardDescription>
                        <CardTitle className="text-3xl">{stats.averageVisitDuration}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <select
                            className="p-2 border rounded-md"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="checked_in">Checked In</option>
                            <option value="checked_out">Checked Out</option>
                            <option value="pre_approved">Pre-Approved</option>
                        </select>
                        <select
                            className="p-2 border rounded-md"
                            value={purposeFilter}
                            onChange={(e) => setPurposeFilter(e.target.value)}
                        >
                            <option value="">All Purposes</option>
                            {purposes.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                        <Input placeholder="Search by name or phone..." className="w-64" />
                        <Button variant="outline" onClick={() => { setStatusFilter(''); setPurposeFilter(''); }}>
                            Clear
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Visitor Log */}
            <Card>
                <CardHeader>
                    <CardTitle>Visitor Log</CardTitle>
                    <CardDescription>Today's visitors</CardDescription>
                </CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-3 px-4">Pass #</th>
                                <th className="text-left py-3 px-4">Visitor</th>
                                <th className="text-left py-3 px-4">Purpose</th>
                                <th className="text-left py-3 px-4">Host</th>
                                <th className="text-left py-3 px-4">Check In</th>
                                <th className="text-left py-3 px-4">Check Out</th>
                                <th className="text-left py-3 px-4">Status</th>
                                <th className="text-left py-3 px-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visitors.map((visitor) => (
                                <tr key={visitor.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">
                                        <Badge variant="outline">{visitor.visitorPass || '-'}</Badge>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div>
                                            <p className="font-medium">{visitor.name}</p>
                                            <p className="text-sm text-muted-foreground">{visitor.phone}</p>
                                            {visitor.company && (
                                                <p className="text-xs text-muted-foreground">{visitor.company}</p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <Badge className={getPurposeColor(visitor.purpose)}>
                                            {purposes.find((p) => p.value === visitor.purpose)?.label}
                                        </Badge>
                                    </td>
                                    <td className="py-3 px-4">
                                        <p className="font-medium">{visitor.hostName}</p>
                                        <p className="text-sm text-muted-foreground">{visitor.hostDepartment}</p>
                                    </td>
                                    <td className="py-3 px-4">
                                        {new Date(visitor.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="py-3 px-4">
                                        {visitor.checkOutTime
                                            ? new Date(visitor.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                                            : '-'}
                                    </td>
                                    <td className="py-3 px-4">
                                        <Badge className={getStatusColor(visitor.status)}>
                                            {visitor.status.replace('_', ' ')}
                                        </Badge>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex gap-2">
                                            {visitor.status === 'checked_in' && (
                                                <Button size="sm" variant="outline">Check Out</Button>
                                            )}
                                            {visitor.status === 'pre_approved' && (
                                                <Button size="sm">Check In</Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => setSelectedVisitor(visitor)}>
                                                View
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Visitor Details Dialog */}
            {selectedVisitor && (
                <Dialog open={!!selectedVisitor} onOpenChange={() => setSelectedVisitor(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Visitor Details</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Name</p>
                                    <p className="font-medium">{selectedVisitor.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Phone</p>
                                    <p className="font-medium">{selectedVisitor.phone}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">ID Proof</p>
                                    <p className="font-medium">{selectedVisitor.idProof} ({selectedVisitor.idNumber})</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Vehicle</p>
                                    <p className="font-medium">{selectedVisitor.vehicleNumber || 'N/A'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm text-muted-foreground">Purpose</p>
                                    <p className="font-medium">{selectedVisitor.purposeDetails}</p>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
