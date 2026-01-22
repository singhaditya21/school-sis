'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface KpiData {
    overdueAmount: number;
    dueSoon: number;
    collectionRate: number;
    consentBlocked: number;
}

interface KpiCardsProps {
    data: KpiData;
}

// Mock drill-down data - totals must match KPI values
// Overdue Amount = ₹42.5L = 4,250,000 - distributed across students
const mockOverdueStudents = [
    { id: 1, name: 'Arjun Singh', class: '5-A', invoice: 'INV-2025-00005', amount: 653000, daysOverdue: 45, phone: '9876543205' },
    { id: 2, name: 'Navya Kapoor', class: '6-B', invoice: 'INV-2025-00012', amount: 571000, daysOverdue: 38, phone: '9876543212' },
    { id: 3, name: 'Kabir Mehta', class: '8-A', invoice: 'INV-2025-00015', amount: 545000, daysOverdue: 32, phone: '9876543215' },
    { id: 4, name: 'Ishaan Das', class: '5-B', invoice: 'INV-2025-00009', amount: 534000, daysOverdue: 28, phone: '9876543209' },
    { id: 5, name: 'Shanaya Kumar', class: '9-B', invoice: 'INV-2025-00018', amount: 462000, daysOverdue: 22, phone: '9876543218' },
    { id: 6, name: 'Reyansh Verma', class: '9-A', invoice: 'INV-2025-00017', amount: 448000, daysOverdue: 18, phone: '9876543217' },
    { id: 7, name: 'Atharva Kulkarni', class: '7-A', invoice: 'INV-2025-00013', amount: 539000, daysOverdue: 15, phone: '9876543213' },
    { id: 8, name: 'Diya Roy', class: '5-C', invoice: 'INV-2025-00010', amount: 498000, daysOverdue: 12, phone: '9876543210' },
]; // Total: 4,250,000 = ₹42.5L

// Due Soon = ₹15L = 1,500,000 (142 invoices pending shown as sample of 10)
const mockDueSoonStudents = [
    { id: 1, name: 'Aarav Sharma', class: '1-A', invoice: 'INV-2025-00101', amount: 134000, dueDate: '2026-01-25', phone: '9876543101' },
    { id: 2, name: 'Priya Patel', class: '1-B', invoice: 'INV-2025-00102', amount: 134000, dueDate: '2026-01-26', phone: '9876543102' },
    { id: 3, name: 'Vivaan Reddy', class: '2-A', invoice: 'INV-2025-00103', amount: 159000, dueDate: '2026-01-27', phone: '9876543103' },
    { id: 4, name: 'Ananya Gupta', class: '2-B', invoice: 'INV-2025-00104', amount: 159000, dueDate: '2026-01-27', phone: '9876543104' },
    { id: 5, name: 'Krishna Menon', class: '4-A', invoice: 'INV-2025-00105', amount: 153000, dueDate: '2026-01-28', phone: '9876543105' },
    { id: 6, name: 'Saanvi Jain', class: '3-A', invoice: 'INV-2025-00106', amount: 148000, dueDate: '2026-01-25', phone: '9876543106' },
    { id: 7, name: 'Dhruv Banerjee', class: '6-A', invoice: 'INV-2025-00107', amount: 165000, dueDate: '2026-01-26', phone: '9876543107' },
    { id: 8, name: 'Aanya Chopra', class: '7-B', invoice: 'INV-2025-00108', amount: 172000, dueDate: '2026-01-27', phone: '9876543108' },
    { id: 9, name: 'Rudra Singh', class: '8-A', invoice: 'INV-2025-00109', amount: 145000, dueDate: '2026-01-28', phone: '9876543109' },
    { id: 10, name: 'Myra Agarwal', class: '10-B', invoice: 'INV-2025-00110', amount: 131000, dueDate: '2026-01-28', phone: '9876543110' },
]; // Total: 1,500,000 = ₹15L (showing 10 of 142)

const mockCollectionData = [
    { class: 'Class 1', total: 360, collected: 340, pending: 20, rate: 94.4 },
    { class: 'Class 2', total: 360, collected: 320, pending: 40, rate: 88.9 },
    { class: 'Class 3', total: 360, collected: 310, pending: 50, rate: 86.1 },
    { class: 'Class 4', total: 360, collected: 305, pending: 55, rate: 84.7 },
    { class: 'Class 5', total: 360, collected: 295, pending: 65, rate: 81.9 },
    { class: 'Class 6', total: 360, collected: 290, pending: 70, rate: 80.6 },
    { class: 'Class 7', total: 360, collected: 315, pending: 45, rate: 87.5 },
    { class: 'Class 8', total: 360, collected: 325, pending: 35, rate: 90.3 },
    { class: 'Class 9', total: 360, collected: 300, pending: 60, rate: 83.3 },
    { class: 'Class 10', total: 360, collected: 335, pending: 25, rate: 93.1 },
    { class: 'Class 11', total: 360, collected: 340, pending: 20, rate: 94.4 },
    { class: 'Class 12', total: 360, collected: 345, pending: 15, rate: 95.8 },
]; // Overall rate: 87%

// Blocked Reminders = 23 students
const mockBlockedReminders = [
    { id: 1, name: 'Rudra Singh', class: '3-A', reason: 'No consent for WhatsApp', guardian: 'Manoj Singh', phone: '9876543203' },
    { id: 2, name: 'Avni Gupta', class: '4-B', reason: 'No consent for SMS', guardian: 'Rakesh Gupta', phone: '9876543204' },
    { id: 3, name: 'Shivansh Reddy', class: '5-A', reason: 'No phone number', guardian: 'Kumar Reddy', phone: '-' },
    { id: 4, name: 'Manya Joshi', class: '6-A', reason: 'Consent withdrawn', guardian: 'Anil Joshi', phone: '9876543206' },
    { id: 5, name: 'Lakshya Mehta', class: '7-B', reason: 'No consent for WhatsApp', guardian: 'Deepak Mehta', phone: '9876543207' },
    { id: 6, name: 'Kiara Chopra', class: '8-A', reason: 'Invalid phone number', guardian: 'Sanjay Chopra', phone: '9876543208' },
    { id: 7, name: 'Tanvi Saxena', class: '9-A', reason: 'No consent for SMS', guardian: 'Amit Saxena', phone: '9876543221' },
    { id: 8, name: 'Arnav Das', class: '9-B', reason: 'No phone number', guardian: 'Rajiv Das', phone: '-' },
    { id: 9, name: 'Vedant Roy', class: '10-A', reason: 'Consent withdrawn', guardian: 'Sunil Roy', phone: '9876543223' },
    { id: 10, name: 'Aaradhya Nair', class: '10-B', reason: 'Invalid phone number', guardian: 'Pradeep Nair', phone: '9876543224' },
    { id: 11, name: 'Ishika Sharma', class: '1-A', reason: 'No consent for WhatsApp', guardian: 'Ramesh Sharma', phone: '9876543225' },
    { id: 12, name: 'Parth Verma', class: '1-B', reason: 'No consent for SMS', guardian: 'Suresh Verma', phone: '9876543226' },
    { id: 13, name: 'Riya Kapoor', class: '2-A', reason: 'No phone number', guardian: 'Vijay Kapoor', phone: '-' },
    { id: 14, name: 'Yash Kumar', class: '2-B', reason: 'Consent withdrawn', guardian: 'Arun Kumar', phone: '9876543228' },
    { id: 15, name: 'Anvi Jain', class: '3-B', reason: 'Invalid phone number', guardian: 'Rahul Jain', phone: '9876543229' },
    { id: 16, name: 'Shaurya Singh', class: '4-A', reason: 'No consent for WhatsApp', guardian: 'Dinesh Singh', phone: '9876543230' },
    { id: 17, name: 'Aditi Patel', class: '5-B', reason: 'No consent for SMS', guardian: 'Mahesh Patel', phone: '9876543231' },
    { id: 18, name: 'Vivan Gupta', class: '6-B', reason: 'No phone number', guardian: 'Nikhil Gupta', phone: '-' },
    { id: 19, name: 'Tara Reddy', class: '7-A', reason: 'Consent withdrawn', guardian: 'Kiran Reddy', phone: '9876543233' },
    { id: 20, name: 'Kabir Banerjee', class: '8-B', reason: 'Invalid phone number', guardian: 'Amit Banerjee', phone: '9876543234' },
    { id: 21, name: 'Anika Shah', class: '11-A', reason: 'No consent for WhatsApp', guardian: 'Ravi Shah', phone: '9876543235' },
    { id: 22, name: 'Rohit Menon', class: '11-B', reason: 'No consent for SMS', guardian: 'Ajay Menon', phone: '9876543236' },
    { id: 23, name: 'Neha Agarwal', class: '12-A', reason: 'No phone number', guardian: 'Sanjay Agarwal', phone: '-' },
]; // Total: 23 students

type DrillDownType = 'overdue' | 'dueSoon' | 'collection' | 'blocked' | null;

export function KpiCards({ data }: KpiCardsProps) {
    const [activeDrill, setActiveDrill] = useState<DrillDownType>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(amount);

    const formatFullCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);

    const kpis = [
        {
            title: 'Overdue Amount',
            value: formatCurrency(data.overdueAmount),
            change: '+8% from last month',
            changeType: 'negative' as const,
            icon: '🔴',
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-50 dark:bg-red-900/20',
            drillType: 'overdue' as DrillDownType,
        },
        {
            title: 'Due Next 7 Days',
            value: formatCurrency(data.dueSoon),
            change: '142 invoices pending',
            changeType: 'neutral' as const,
            icon: '🟡',
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
            drillType: 'dueSoon' as DrillDownType,
        },
        {
            title: 'Collection Rate (30d)',
            value: `${data.collectionRate}%`,
            change: '+3% from last month',
            changeType: 'positive' as const,
            icon: '🟢',
            color: 'text-green-600 dark:text-green-400',
            bgColor: 'bg-green-50 dark:bg-green-900/20',
            drillType: 'collection' as DrillDownType,
        },
        {
            title: 'Reminders Blocked',
            value: data.consentBlocked.toString(),
            change: 'Missing guardian consent',
            changeType: 'warning' as const,
            icon: '⚠️',
            color: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
            drillType: 'blocked' as DrillDownType,
        },
    ];

    const renderDrillContent = () => {
        switch (activeDrill) {
            case 'overdue':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {mockOverdueStudents.length} students with overdue fees
                            </div>
                            <Badge variant="destructive">Total: {formatFullCurrency(mockOverdueStudents.reduce((sum, s) => sum + s.amount, 0))}</Badge>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Days Overdue</TableHead>
                                    <TableHead>Phone</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockOverdueStudents.map((student) => (
                                    <TableRow key={student.id} className="hover:bg-red-50">
                                        <TableCell className="font-medium">{student.name}</TableCell>
                                        <TableCell>{student.class}</TableCell>
                                        <TableCell className="text-blue-600">{student.invoice}</TableCell>
                                        <TableCell className="text-right font-semibold text-red-600">{formatFullCurrency(student.amount)}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={student.daysOverdue > 30 ? 'destructive' : 'secondary'}>
                                                {student.daysOverdue} days
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );

            case 'dueSoon':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {mockDueSoonStudents.length} invoices due in the next 7 days
                            </div>
                            <Badge className="bg-amber-500">Total: {formatFullCurrency(mockDueSoonStudents.reduce((sum, s) => sum + s.amount, 0))}</Badge>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Phone</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockDueSoonStudents.map((student) => (
                                    <TableRow key={student.id} className="hover:bg-amber-50">
                                        <TableCell className="font-medium">{student.name}</TableCell>
                                        <TableCell>{student.class}</TableCell>
                                        <TableCell className="text-blue-600">{student.invoice}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatFullCurrency(student.amount)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="border-amber-500 text-amber-700">
                                                {new Date(student.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );

            case 'collection':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Class-wise collection breakdown for the last 30 days
                            </div>
                            <Badge className="bg-green-500">Overall: {data.collectionRate}%</Badge>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Class</TableHead>
                                    <TableHead className="text-right">Total Students</TableHead>
                                    <TableHead className="text-right">Collected</TableHead>
                                    <TableHead className="text-right">Pending</TableHead>
                                    <TableHead className="text-right">Collection Rate</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockCollectionData.map((row) => (
                                    <TableRow key={row.class} className="hover:bg-green-50">
                                        <TableCell className="font-medium">{row.class}</TableCell>
                                        <TableCell className="text-right">{row.total}</TableCell>
                                        <TableCell className="text-right text-green-600 font-semibold">{row.collected}</TableCell>
                                        <TableCell className="text-right text-red-600">{row.pending}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${row.rate >= 90 ? 'bg-green-500' : row.rate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${row.rate}%` }}
                                                    />
                                                </div>
                                                <span className={`font-semibold ${row.rate >= 90 ? 'text-green-600' : row.rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {row.rate}%
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );

            case 'blocked':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {mockBlockedReminders.length} students cannot receive automated reminders
                            </div>
                            <Badge variant="outline" className="border-orange-500 text-orange-700">Action Required</Badge>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Guardian</TableHead>
                                    <TableHead>Phone</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockBlockedReminders.map((student) => (
                                    <TableRow key={student.id} className="hover:bg-orange-50">
                                        <TableCell className="font-medium">{student.name}</TableCell>
                                        <TableCell>{student.class}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="border-orange-400 text-orange-600 bg-orange-50">
                                                {student.reason}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{student.guardian}</TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );

            default:
                return null;
        }
    };

    const getDrillTitle = () => {
        switch (activeDrill) {
            case 'overdue': return 'Overdue Fees - Student Details';
            case 'dueSoon': return 'Due Next 7 Days - Invoice Details';
            case 'collection': return 'Collection Rate - Class-wise Breakdown';
            case 'blocked': return 'Blocked Reminders - Students Without Consent';
            default: return '';
        }
    };

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi, i) => (
                    <Card
                        key={i}
                        className={`${kpi.bgColor} border-0 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
                        onClick={() => setActiveDrill(kpi.drillType)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {kpi.title}
                            </CardTitle>
                            <span className="text-xl">{kpi.icon}</span>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {kpi.change}
                                <span className="ml-2 text-blue-600 hover:underline">Click to drill down →</span>
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={activeDrill !== null} onOpenChange={(open) => !open && setActiveDrill(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            {activeDrill === 'overdue' && '🔴'}
                            {activeDrill === 'dueSoon' && '🟡'}
                            {activeDrill === 'collection' && '🟢'}
                            {activeDrill === 'blocked' && '⚠️'}
                            {getDrillTitle()}
                        </DialogTitle>
                    </DialogHeader>
                    {renderDrillContent()}
                </DialogContent>
            </Dialog>
        </>
    );
}
