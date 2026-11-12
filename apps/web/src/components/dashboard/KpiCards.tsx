'use client';

import { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertOctagon, Clock, ShieldAlert, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCompactCurrency as formatCurrency, formatCurrency as formatFullCurrency } from '@/lib/format';

interface KpiData {
    overdueAmount: number;
    dueSoon: number;
    collectionRate: number;
    consentBlocked: number;
}

interface OverdueStudent {
    id: string | number;
    name: string;
    class: string;
    invoice: string;
    amount: number | string;
    daysOverdue: number;
    phone: string;
}

interface DueSoonStudent {
    id: string | number;
    name: string;
    class: string;
    invoice: string;
    amount: number | string;
    dueDate: string;
    phone: string;
}

interface CollectionRow {
    class: string;
    total: number | string;
    collected: number | string;
    pending: number | string;
    rate: number;
}

interface BlockedReminder {
    id: string | number;
    name: string;
    class: string;
    reason: string;
    guardian: string;
    phone: string;
}

interface KpiCardsProps {
    data: KpiData;
    overdueStudents?: OverdueStudent[];
    dueSoonStudents?: DueSoonStudent[];
    collectionData?: CollectionRow[];
    blockedReminders?: BlockedReminder[];
}

type DrillDownType = 'overdue' | 'dueSoon' | 'collection' | 'blocked' | null;

export function KpiCards({
    data,
    overdueStudents = [],
    dueSoonStudents = [],
    collectionData = [],
    blockedReminders = [],
}: KpiCardsProps) {
    const [activeDrill, setActiveDrill] = useState<DrillDownType>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const kpis: {
        title: string;
        value: string;
        change: string;
        icon: LucideIcon;
        color: string;
        bgColor: string;
        badgeTone: string;
        drillType: DrillDownType;
    }[] = [
        {
            title: 'Overdue Amount',
            value: formatCurrency(data.overdueAmount),
            change: `${overdueStudents.length} students`,
            icon: AlertOctagon,
            color: 'text-destructive-subtle-foreground',
            bgColor: 'bg-destructive-subtle border border-destructive/20',
            badgeTone: 'bg-background/80 text-destructive border border-destructive/25',
            drillType: 'overdue',
        },
        {
            title: 'Due Next 7 Days',
            value: formatCurrency(data.dueSoon),
            change: `${dueSoonStudents.length} invoices pending`,
            icon: Clock,
            color: 'text-warning-subtle-foreground',
            bgColor: 'bg-warning-subtle border border-warning/25',
            badgeTone: 'bg-background/80 text-brass border border-brass/30',
            drillType: 'dueSoon',
        },
        {
            title: 'Collection Rate (30d)',
            value: `${data.collectionRate}%`,
            change: `${collectionData.length} classes tracked`,
            icon: TrendingUp,
            color: 'text-success-subtle-foreground',
            bgColor: 'bg-success-subtle border border-success/25',
            badgeTone: 'bg-background/80 text-success border border-success/25',
            drillType: 'collection',
        },
        {
            title: 'Reminders Blocked',
            value: data.consentBlocked.toString(),
            change: 'Missing guardian consent',
            icon: ShieldAlert,
            color: 'text-accent-foreground',
            bgColor: 'bg-accent/55 border border-brass/30',
            badgeTone: 'bg-background/80 text-primary border border-brass/30',
            drillType: 'blocked',
        },
    ];

    const renderDrillContent = () => {
        switch (activeDrill) {
            case 'overdue':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {overdueStudents.length} students with overdue fees
                            </div>
                            <Badge variant="destructive">
                                Total:{' '}
                                {formatFullCurrency(
                                    overdueStudents.reduce(
                                        (sum: number, s: OverdueStudent) => sum + Number(s.amount || 0),
                                        0,
                                    ),
                                )}
                            </Badge>
                        </div>
                        {overdueStudents.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No overdue data available.</p>
                        ) : (
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
                                    {overdueStudents.map((student: OverdueStudent) => (
                                        <TableRow key={student.id} className="hover:bg-destructive-subtle/40">
                                            <TableCell className="font-medium">{student.name}</TableCell>
                                            <TableCell>{student.class}</TableCell>
                                            <TableCell className="text-primary">{student.invoice}</TableCell>
                                            <TableCell className="text-right font-semibold text-destructive">
                                                {formatFullCurrency(Number(student.amount))}
                                            </TableCell>
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
                        )}
                    </div>
                );
            case 'dueSoon':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {dueSoonStudents.length} invoices due in the next 7 days
                            </div>
                            <Badge variant="outline" className="border-brass/40 bg-accent text-accent-foreground">
                                Total:{' '}
                                {formatFullCurrency(
                                    dueSoonStudents.reduce(
                                        (sum: number, s: DueSoonStudent) => sum + Number(s.amount || 0),
                                        0,
                                    ),
                                )}
                            </Badge>
                        </div>
                        {dueSoonStudents.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No upcoming due data.</p>
                        ) : (
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
                                    {dueSoonStudents.map((student: DueSoonStudent) => (
                                        <TableRow key={student.id} className="hover:bg-warning-subtle/40">
                                            <TableCell className="font-medium">{student.name}</TableCell>
                                            <TableCell>{student.class}</TableCell>
                                            <TableCell className="text-primary">{student.invoice}</TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {formatFullCurrency(Number(student.amount))}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className="border-warning/40 bg-warning-subtle text-warning-subtle-foreground"
                                                >
                                                    {student.dueDate}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                );
            case 'collection':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Class-wise collection breakdown for the last 30 days
                            </div>
                            <Badge className="bg-success text-success-foreground">
                                Overall: {data.collectionRate}%
                            </Badge>
                        </div>
                        {collectionData.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No collection data.</p>
                        ) : (
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
                                    {collectionData.map((row: CollectionRow) => (
                                        <TableRow key={row.class} className="hover:bg-success-subtle/35">
                                            <TableCell className="font-medium">{row.class}</TableCell>
                                            <TableCell className="text-right">{row.total}</TableCell>
                                            <TableCell className="text-right text-success font-semibold">
                                                {row.collected}
                                            </TableCell>
                                            <TableCell className="text-right text-destructive">{row.pending}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${
                                                                row.rate >= 90
                                                                    ? 'bg-success'
                                                                    : row.rate >= 80
                                                                      ? 'bg-warning'
                                                                      : 'bg-destructive'
                                                            }`}
                                                            style={{ width: `${row.rate}%` }}
                                                        />
                                                    </div>
                                                    <span
                                                        className={`font-semibold ${
                                                            row.rate >= 90
                                                                ? 'text-success'
                                                                : row.rate >= 80
                                                                  ? 'text-warning'
                                                                  : 'text-destructive'
                                                        }`}
                                                    >
                                                        {row.rate}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                );
            case 'blocked':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {blockedReminders.length} students cannot receive automated reminders
                            </div>
                            <Badge variant="outline" className="border-brass/40 bg-accent text-accent-foreground">
                                Action Required
                            </Badge>
                        </div>
                        {blockedReminders.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No blocked reminders.</p>
                        ) : (
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
                                    {blockedReminders.map((student: BlockedReminder) => (
                                        <TableRow key={student.id} className="hover:bg-accent/40">
                                            <TableCell className="font-medium">{student.name}</TableCell>
                                            <TableCell>{student.class}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className="border-warning/40 bg-warning-subtle text-warning-subtle-foreground"
                                                >
                                                    {student.reason}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{student.guardian}</TableCell>
                                            <TableCell className="text-muted-foreground">{student.phone}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const getDrillTitle = () => {
        switch (activeDrill) {
            case 'overdue':
                return 'Overdue Fees - Student Details';
            case 'dueSoon':
                return 'Due Next 7 Days - Invoice Details';
            case 'collection':
                return 'Collection Rate - Class-wise Breakdown';
            case 'blocked':
                return 'Blocked Reminders - Students Without Consent';
            default:
                return '';
        }
    };

    const DrillIcon =
        activeDrill === 'overdue'
            ? AlertOctagon
            : activeDrill === 'dueSoon'
              ? Clock
              : activeDrill === 'collection'
                ? TrendingUp
                : ShieldAlert;

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                        <Card
                            key={i}
                            className={`${kpi.bgColor} shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99]`}
                            onClick={() => setActiveDrill(kpi.drillType)}
                        >
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    {kpi.title}
                                </CardTitle>
                                <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.badgeTone}`}
                                >
                                    <Icon className="h-4 w-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {kpi.change}
                                    <span className="ml-2 text-primary font-medium hover:underline">
                                        Drill down →
                                    </span>
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {mounted && (
                <Dialog open={activeDrill !== null} onOpenChange={(open) => !open && setActiveDrill(null)}>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center gap-2.5">
                                {activeDrill && (
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent border border-brass/30 text-primary">
                                        <DrillIcon className="h-4 w-4" />
                                    </span>
                                )}
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
