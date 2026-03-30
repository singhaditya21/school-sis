'use client';

import { useState, useEffect } from 'react';
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
    overdueStudents?: any[];
    dueSoonStudents?: any[];
    collectionData?: any[];
    blockedReminders?: any[];
}

type DrillDownType = 'overdue' | 'dueSoon' | 'collection' | 'blocked' | null;

export function KpiCards({ data, overdueStudents = [], dueSoonStudents = [], collectionData = [], blockedReminders = [] }: KpiCardsProps) {
    const [activeDrill, setActiveDrill] = useState<DrillDownType>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(amount);

    const formatFullCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

    const kpis = [
        { title: 'Overdue Amount', value: formatCurrency(data.overdueAmount), change: `${overdueStudents.length} students`, changeType: 'negative' as const, icon: '🔴', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20', drillType: 'overdue' as DrillDownType },
        { title: 'Due Next 7 Days', value: formatCurrency(data.dueSoon), change: `${dueSoonStudents.length} invoices pending`, changeType: 'neutral' as const, icon: '🟡', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20', drillType: 'dueSoon' as DrillDownType },
        { title: 'Collection Rate (30d)', value: `${data.collectionRate}%`, change: `${collectionData.length} classes tracked`, changeType: 'positive' as const, icon: '🟢', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20', drillType: 'collection' as DrillDownType },
        { title: 'Reminders Blocked', value: data.consentBlocked.toString(), change: 'Missing guardian consent', changeType: 'warning' as const, icon: '⚠️', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20', drillType: 'blocked' as DrillDownType },
    ];

    const renderDrillContent = () => {
        switch (activeDrill) {
            case 'overdue':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">{overdueStudents.length} students with overdue fees</div>
                            <Badge variant="destructive">Total: {formatFullCurrency(overdueStudents.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0))}</Badge>
                        </div>
                        {overdueStudents.length === 0 ? <p className="text-gray-500 text-center py-8">No overdue data available.</p> : (
                            <Table><TableHeader><TableRow>
                                <TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Invoice</TableHead>
                                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Days Overdue</TableHead><TableHead>Phone</TableHead>
                            </TableRow></TableHeader><TableBody>
                                {overdueStudents.map((student: any) => (
                                    <TableRow key={student.id} className="hover:bg-red-50">
                                        <TableCell className="font-medium">{student.name}</TableCell><TableCell>{student.class}</TableCell>
                                        <TableCell className="text-blue-600">{student.invoice}</TableCell>
                                        <TableCell className="text-right font-semibold text-red-600">{formatFullCurrency(Number(student.amount))}</TableCell>
                                        <TableCell className="text-right"><Badge variant={student.daysOverdue > 30 ? 'destructive' : 'secondary'}>{student.daysOverdue} days</Badge></TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody></Table>
                        )}
                    </div>
                );
            case 'dueSoon':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">{dueSoonStudents.length} invoices due in the next 7 days</div>
                            <Badge className="bg-amber-500">Total: {formatFullCurrency(dueSoonStudents.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0))}</Badge>
                        </div>
                        {dueSoonStudents.length === 0 ? <p className="text-gray-500 text-center py-8">No upcoming due data.</p> : (
                            <Table><TableHeader><TableRow>
                                <TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Invoice</TableHead>
                                <TableHead className="text-right">Amount</TableHead><TableHead>Due Date</TableHead><TableHead>Phone</TableHead>
                            </TableRow></TableHeader><TableBody>
                                {dueSoonStudents.map((student: any) => (
                                    <TableRow key={student.id} className="hover:bg-amber-50">
                                        <TableCell className="font-medium">{student.name}</TableCell><TableCell>{student.class}</TableCell>
                                        <TableCell className="text-blue-600">{student.invoice}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatFullCurrency(Number(student.amount))}</TableCell>
                                        <TableCell><Badge variant="outline" className="border-amber-500 text-amber-700">{student.dueDate}</Badge></TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody></Table>
                        )}
                    </div>
                );
            case 'collection':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">Class-wise collection breakdown for the last 30 days</div>
                            <Badge className="bg-green-500">Overall: {data.collectionRate}%</Badge>
                        </div>
                        {collectionData.length === 0 ? <p className="text-gray-500 text-center py-8">No collection data.</p> : (
                            <Table><TableHeader><TableRow>
                                <TableHead>Class</TableHead><TableHead className="text-right">Total Students</TableHead>
                                <TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Pending</TableHead>
                                <TableHead className="text-right">Collection Rate</TableHead>
                            </TableRow></TableHeader><TableBody>
                                {collectionData.map((row: any) => (
                                    <TableRow key={row.class} className="hover:bg-green-50">
                                        <TableCell className="font-medium">{row.class}</TableCell>
                                        <TableCell className="text-right">{row.total}</TableCell>
                                        <TableCell className="text-right text-green-600 font-semibold">{row.collected}</TableCell>
                                        <TableCell className="text-right text-red-600">{row.pending}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className={`h-full ${row.rate >= 90 ? 'bg-green-500' : row.rate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${row.rate}%` }} />
                                                </div>
                                                <span className={`font-semibold ${row.rate >= 90 ? 'text-green-600' : row.rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{row.rate}%</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody></Table>
                        )}
                    </div>
                );
            case 'blocked':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">{blockedReminders.length} students cannot receive automated reminders</div>
                            <Badge variant="outline" className="border-orange-500 text-orange-700">Action Required</Badge>
                        </div>
                        {blockedReminders.length === 0 ? <p className="text-gray-500 text-center py-8">No blocked reminders.</p> : (
                            <Table><TableHeader><TableRow>
                                <TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Reason</TableHead>
                                <TableHead>Guardian</TableHead><TableHead>Phone</TableHead>
                            </TableRow></TableHeader><TableBody>
                                {blockedReminders.map((student: any) => (
                                    <TableRow key={student.id} className="hover:bg-orange-50">
                                        <TableCell className="font-medium">{student.name}</TableCell><TableCell>{student.class}</TableCell>
                                        <TableCell><Badge variant="outline" className="border-orange-400 text-orange-600 bg-orange-50">{student.reason}</Badge></TableCell>
                                        <TableCell>{student.guardian}</TableCell>
                                        <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody></Table>
                        )}
                    </div>
                );
            default: return null;
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

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi, i) => (
                    <Card key={i} className={`${kpi.bgColor} border-0 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`} onClick={() => setActiveDrill(kpi.drillType)}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                            <span className="text-xl">{kpi.icon}</span>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                            <p className="text-xs text-muted-foreground mt-1">{kpi.change}<span className="ml-2 text-blue-600 hover:underline">Click to drill down →</span></p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {mounted && (
                <Dialog open={activeDrill !== null} onOpenChange={(open) => !open && setActiveDrill(null)}>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center gap-2">
                                {activeDrill === 'overdue' && '🔴'}{activeDrill === 'dueSoon' && '🟡'}
                                {activeDrill === 'collection' && '🟢'}{activeDrill === 'blocked' && '⚠️'}
                                {getDrillTitle()}
                            </DialogTitle>
                        </DialogHeader>
                        {renderDrillContent()}
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
