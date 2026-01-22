'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    mockStaff,
    getHRStats,
    type Staff
} from '@/lib/services/hr/hr.service';

const departments = [
    { value: 'ALL', label: 'All Departments' },
    { value: 'TEACHING', label: 'Teaching' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'ACCOUNTS', label: 'Accounts' },
    { value: 'TRANSPORT', label: 'Transport' },
    { value: 'SUPPORT', label: 'Support' },
];

export default function HRPage() {
    const [departmentFilter, setDepartmentFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const stats = getHRStats();

    const filteredStaff = mockStaff.filter(staff => {
        const matchesDept = departmentFilter === 'ALL' || staff.department === departmentFilter;
        const matchesSearch = !searchQuery ||
            `${staff.firstName} ${staff.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
            staff.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesDept && matchesSearch;
    });

    const getDeptBadge = (dept: Staff['department']) => {
        const colors: Record<string, string> = {
            TEACHING: 'bg-blue-100 text-blue-700',
            ADMIN: 'bg-purple-100 text-purple-700',
            ACCOUNTS: 'bg-green-100 text-green-700',
            TRANSPORT: 'bg-orange-100 text-orange-700',
            SUPPORT: 'bg-gray-100 text-gray-700',
            MANAGEMENT: 'bg-red-100 text-red-700',
        };
        return <Badge className={colors[dept]}>{dept}</Badge>;
    };

    const getStatusBadge = (status: Staff['status']) => {
        const colors: Record<string, string> = {
            ACTIVE: 'bg-green-100 text-green-700',
            ON_LEAVE: 'bg-yellow-100 text-yellow-700',
            RESIGNED: 'bg-gray-100 text-gray-700',
            TERMINATED: 'bg-red-100 text-red-700',
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">HR Management</h1>
                    <p className="text-gray-600 mt-1">Staff directory and HR operations</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/hr/payroll" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        💰 Payroll
                    </Link>
                    <Link href="/hr/leave" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                        📅 Leave ({stats.pendingLeaves})
                    </Link>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        + Add Staff
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Staff</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalStaff}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Active</div>
                        <div className="text-2xl font-bold text-green-600">{stats.activeStaff}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Teaching</div>
                        <div className="text-2xl font-bold text-purple-600">{stats.teaching}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Non-Teaching</div>
                        <div className="text-2xl font-bold text-orange-600">{stats.nonTeaching}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Leaves</div>
                        <div className="text-2xl font-bold text-yellow-600">{stats.pendingLeaves}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Monthly Payroll</div>
                        <div className="text-2xl font-bold text-indigo-600">₹{(stats.monthlyPayroll / 100000).toFixed(1)}L</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
                <input
                    type="text"
                    placeholder="Search by name or employee ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 px-4 py-2 border rounded-lg"
                />
                <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                >
                    {departments.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                </select>
            </div>

            {/* Staff Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStaff.map(staff => (
                    <Card
                        key={staff.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => setSelectedStaff(staff)}
                    >
                        <CardContent className="pt-4">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                                    {staff.firstName[0]}{staff.lastName[0]}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold">{staff.firstName} {staff.lastName}</h3>
                                    <p className="text-sm text-gray-500">{staff.designation}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        {getDeptBadge(staff.department)}
                                        {getStatusBadge(staff.status)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs text-gray-500">
                                <div>📧 {staff.email}</div>
                                <div>📱 {staff.phone}</div>
                                <div>🆔 {staff.employeeId}</div>
                                <div>📅 {new Date(staff.joiningDate).getFullYear()}</div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Staff Detail Dialog */}
            <Dialog open={!!selectedStaff} onOpenChange={() => setSelectedStaff(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Employee Profile</DialogTitle>
                    </DialogHeader>
                    {selectedStaff && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                                    {selectedStaff.firstName[0]}{selectedStaff.lastName[0]}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedStaff.firstName} {selectedStaff.lastName}</h2>
                                    <p className="text-gray-500">{selectedStaff.designation}</p>
                                    <div className="flex gap-2 mt-2">
                                        {getDeptBadge(selectedStaff.department)}
                                        {getStatusBadge(selectedStaff.status)}
                                        <Badge variant="outline">{selectedStaff.employmentType}</Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">Employee ID:</span><br />{selectedStaff.employeeId}</div>
                                <div><span className="text-gray-500">Email:</span><br />{selectedStaff.email}</div>
                                <div><span className="text-gray-500">Phone:</span><br />{selectedStaff.phone}</div>
                                <div><span className="text-gray-500">DOB:</span><br />{new Date(selectedStaff.dateOfBirth).toLocaleDateString('en-IN')}</div>
                                <div><span className="text-gray-500">Joining Date:</span><br />{new Date(selectedStaff.joiningDate).toLocaleDateString('en-IN')}</div>
                                <div><span className="text-gray-500">Experience:</span><br />{selectedStaff.experience} years</div>
                                <div><span className="text-gray-500">Qualification:</span><br />{selectedStaff.qualification}</div>
                                <div><span className="text-gray-500">Address:</span><br />{selectedStaff.address}</div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="font-semibold mb-3">💰 Salary Details</h4>
                                <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div><span className="text-gray-500">Basic:</span><br />₹{selectedStaff.salary.basic.toLocaleString()}</div>
                                    <div><span className="text-gray-500">HRA:</span><br />₹{selectedStaff.salary.hra.toLocaleString()}</div>
                                    <div><span className="text-gray-500">DA:</span><br />₹{selectedStaff.salary.da.toLocaleString()}</div>
                                    <div><span className="text-gray-500">Gross:</span><br />₹{selectedStaff.salary.gross.toLocaleString()}</div>
                                    <div><span className="text-gray-500">PF:</span><br />₹{selectedStaff.salary.pf.toLocaleString()}</div>
                                    <div><span className="text-gray-500">Tax:</span><br />₹{selectedStaff.salary.tax.toLocaleString()}</div>
                                    <div className="col-span-2"><span className="text-gray-500">Net Salary:</span><br /><span className="text-green-600 font-bold text-lg">₹{selectedStaff.salary.net.toLocaleString()}</span></div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Link href={`/hr/${selectedStaff.id}`} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-center hover:bg-blue-700">
                                    View Full Profile
                                </Link>
                                <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                                    Edit
                                </button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
