'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Bell,
    AlertTriangle,
    Clock,
    Send,
    Filter,
    FileText,
    Users,
    IndianRupee
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import type { DefaulterAlertStats, DefaulterItem } from '@/lib/actions/fees';

interface DefaulterAlertsProps {
    stats: DefaulterAlertStats;
    defaulters: DefaulterItem[];
}

const getStatus = (daysOverdue: number) => {
    if (daysOverdue >= 60) return { label: 'Critical', variant: 'destructive' as const, icon: AlertTriangle };
    if (daysOverdue >= 30) return { label: 'Serious', variant: 'default' as const, icon: Clock };
    if (daysOverdue >= 15) return { label: 'Warning', variant: 'secondary' as const, icon: Bell };
    return { label: 'Reminder', variant: 'outline' as const, icon: Bell };
};

/** Severity bands, kept in step with getStatus() above. */
const SEVERITY_FILTERS = [
    { value: 'ALL', label: 'All severities' },
    { value: 'CRITICAL', label: 'Critical (60+ days)' },
    { value: 'SERIOUS', label: 'Serious (30-59 days)' },
    { value: 'WARNING', label: 'Warning (15-29 days)' },
    { value: 'REMINDER', label: 'Reminder (under 15 days)' },
] as const;

type SeverityFilter = (typeof SEVERITY_FILTERS)[number]['value'];

function matchesSeverity(daysOverdue: number, filter: SeverityFilter): boolean {
    switch (filter) {
        case 'CRITICAL':
            return daysOverdue >= 60;
        case 'SERIOUS':
            return daysOverdue >= 30 && daysOverdue < 60;
        case 'WARNING':
            return daysOverdue >= 15 && daysOverdue < 30;
        case 'REMINDER':
            return daysOverdue < 15;
        default:
            return true;
    }
}

/** The invoice workspace matches students by name via its `?q=` search. */
function studentInvoicesHref(studentName: string): string {
    return `/invoices?q=${encodeURIComponent(studentName)}`;
}

export default function DefaulterAlerts({ stats, defaulters }: DefaulterAlertsProps) {
    const [severity, setSeverity] = useState<SeverityFilter>('ALL');
    const visibleDefaulters = defaulters.filter((d) => matchesSeverity(d.daysOverdue, severity));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Defaulter Alerts</h1>
                    <p className="text-muted-foreground">Automated fee reminder and escalation management</p>
                </div>
                <Button disabled title="Configure a live fee-reminder notification workflow first.">
                    <Send className="h-4 w-4 mr-2" />
                    Provider setup required
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Total Defaulters</span>
                        </div>
                        <div className="text-2xl font-bold mt-1">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <span className="text-sm text-red-600">Critical (60+ days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-red-700">{stats.critical}</div>
                    </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-orange-500" />
                            <span className="text-sm text-orange-600">Serious (30+ days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-orange-700">{stats.serious}</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-amber-500" />
                            <span className="text-sm text-amber-600">Warning (15+ days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-amber-700">{stats.warning}</div>
                    </CardContent>
                </Card>
                <Card className="border-indigo-200 bg-indigo-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <IndianRupee className="h-5 w-5 text-indigo-500" />
                            <span className="text-sm text-indigo-600">Total Overdue</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-indigo-700">₹{(stats.totalAmount / 100000).toFixed(1)}L</div>
                    </CardContent>
                </Card>
            </div>

            {/* Escalation Thresholds */}
            <Card>
                <CardHeader>
                    <CardTitle>Escalation Thresholds</CardTitle>
                    <CardDescription>Automated reminder rules based on days overdue</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-center">
                        <div className="p-3 border rounded-lg">
                            <div className="text-lg font-semibold">7+ days</div>
                            <Badge variant="outline">Gentle Reminder</Badge>
                        </div>
                        <div className="p-3 border rounded-lg border-amber-300">
                            <div className="text-lg font-semibold">15+ days</div>
                            <Badge variant="secondary">Warning Notice</Badge>
                        </div>
                        <div className="p-3 border rounded-lg border-orange-300">
                            <div className="text-lg font-semibold">30+ days</div>
                            <Badge>Final Notice</Badge>
                        </div>
                        <div className="p-3 border rounded-lg border-red-300">
                            <div className="text-lg font-semibold">60+ days</div>
                            <Badge variant="destructive">Escalate to Principal</Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Defaulter List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Defaulter List</CardTitle>
                            <CardDescription>
                                {severity === 'ALL'
                                    ? `Students with overdue fee payments · ${defaulters.length} total`
                                    : `${visibleDefaulters.length} of ${defaulters.length} students in this severity band`}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select
                                value={severity}
                                onValueChange={(value) => setSeverity(value as SeverityFilter)}
                            >
                                <SelectTrigger className="h-8 w-[210px] text-sm" aria-label="Filter by severity">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SEVERITY_FILTERS.map((f) => (
                                        <SelectItem key={f.value} value={f.value}>
                                            {f.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {defaulters.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-medium">No defaulters found</p>
                            <p className="text-sm">All students are up to date with their fee payments.</p>
                        </div>
                    ) : visibleDefaulters.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-medium">No defaulters in this severity band</p>
                            <p className="text-sm">
                                {defaulters.length} defaulter{defaulters.length !== 1 ? 's' : ''} fall outside the
                                selected filter. Choose “All severities” to see them.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Amount Due</TableHead>
                                    <TableHead>Days Overdue</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Invoices</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleDefaulters.map((defaulter) => {
                                    const status = getStatus(defaulter.daysOverdue);
                                    return (
                                        <TableRow key={defaulter.studentId}>
                                            <TableCell className="font-medium">{defaulter.studentName}</TableCell>
                                            <TableCell>{defaulter.className}</TableCell>
                                            <TableCell className="font-semibold">{formatCurrency(defaulter.balance)}</TableCell>
                                            <TableCell>{defaulter.daysOverdue} days</TableCell>
                                            <TableCell>
                                                <Badge variant={status.variant}>
                                                    <status.icon className="h-3 w-3 mr-1" />
                                                    {status.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{defaulter.invoiceCount}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button size="sm" variant="outline" asChild>
                                                        <Link
                                                            href={studentInvoicesHref(defaulter.studentName)}
                                                            title={`View all invoices for ${defaulter.studentName}`}
                                                        >
                                                            <FileText className="h-3 w-3 mr-1" />
                                                            Invoices
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled
                                                        title="Configure a live fee-reminder notification workflow first."
                                                    >
                                                        <Send className="h-3 w-3 mr-1" />
                                                        Send Reminder
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
