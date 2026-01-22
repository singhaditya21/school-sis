'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockPayroll, mockStaff, type PayrollRecord } from '@/lib/services/hr/hr.service';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollPage() {
    const [selectedMonth, setSelectedMonth] = useState('January');
    const [selectedYear, setSelectedYear] = useState(2026);
    const [payroll, setPayroll] = useState(mockPayroll);

    const totalGross = payroll.reduce((sum, p) => sum + p.grossSalary, 0);
    const totalDeductions = payroll.reduce((sum, p) => sum + p.totalDeductions, 0);
    const totalNet = payroll.reduce((sum, p) => sum + p.netSalary, 0);

    const getStatusBadge = (status: PayrollRecord['status']) => {
        const colors: Record<string, string> = {
            DRAFT: 'bg-gray-100 text-gray-700',
            PROCESSED: 'bg-blue-100 text-blue-700',
            PAID: 'bg-green-100 text-green-700',
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    const handleProcessPayroll = () => {
        setPayroll(prev => prev.map(p => ({ ...p, status: 'PROCESSED' as const })));
    };

    const handleMarkPaid = () => {
        setPayroll(prev => prev.map(p => ({ ...p, status: 'PAID' as const, paidOn: new Date().toISOString() })));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Payroll Management</h1>
                    <p className="text-gray-600 mt-1">Process and manage staff salaries</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/hr" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                        ← Back to HR
                    </Link>
                    <button
                        onClick={handleProcessPayroll}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        🔄 Process Payroll
                    </button>
                    <button
                        onClick={handleMarkPaid}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        ✅ Mark All Paid
                    </button>
                </div>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-4">
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                >
                    {months.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-4 py-2 border rounded-lg"
                >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                </select>
                <span className="text-gray-500">
                    Showing payroll for <strong>{selectedMonth} {selectedYear}</strong>
                </span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Employees</div>
                        <div className="text-2xl font-bold text-blue-600">{payroll.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Gross</div>
                        <div className="text-2xl font-bold text-purple-600">₹{(totalGross / 100000).toFixed(2)}L</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Deductions</div>
                        <div className="text-2xl font-bold text-red-600">₹{(totalDeductions / 100000).toFixed(2)}L</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Net Payable</div>
                        <div className="text-2xl font-bold text-green-600">₹{(totalNet / 100000).toFixed(2)}L</div>
                    </CardContent>
                </Card>
            </div>

            {/* Payroll Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Salary Sheet - {selectedMonth} {selectedYear}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Basic</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">HRA</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">DA</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">PF</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {payroll.map(record => (
                                    <tr key={record.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-3 font-medium">{record.staffName}</td>
                                        <td className="px-3 py-3">
                                            <Badge variant="outline" className="text-xs">{record.department}</Badge>
                                        </td>
                                        <td className="px-3 py-3 text-right">{record.daysPresent}/{record.workingDays}</td>
                                        <td className="px-3 py-3 text-right">₹{record.basic.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right">₹{record.hra.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right">₹{record.da.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right font-medium">₹{record.grossSalary.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right text-red-600">-₹{record.pf.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right text-red-600">-₹{record.tax.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right font-bold text-green-600">₹{record.netSalary.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center">{getStatusBadge(record.status)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-100 font-semibold">
                                <tr>
                                    <td className="px-3 py-3" colSpan={6}>Total</td>
                                    <td className="px-3 py-3 text-right">₹{totalGross.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right text-red-600" colSpan={2}>-₹{totalDeductions.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right text-green-600">₹{totalNet.toLocaleString()}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
