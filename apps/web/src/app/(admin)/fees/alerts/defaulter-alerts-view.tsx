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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    AlertTriangle,
    Bell,
    Clock,
    FileText,
    Filter,
    IndianRupee,
    Info,
    Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { DefaulterAlertStats, DefaulterItem } from '@/lib/actions/fees';

interface DefaulterAlertsViewProps {
    stats: DefaulterAlertStats;
    defaulters: DefaulterItem[];
}

const getSeverity = (daysOverdue: number) => {
    if (daysOverdue >= 60) return { label: 'Critical', variant: 'destructive' as const, icon: AlertTriangle };
    if (daysOverdue >= 30) return { label: 'Serious', variant: 'default' as const, icon: Clock };
    if (daysOverdue >= 15) return { label: 'Warning', variant: 'secondary' as const, icon: Bell };
    return { label: 'Early', variant: 'outline' as const, icon: Bell };
};

/** Severity bands, kept in step with getSeverity() above. */
const SEVERITY_FILTERS = [
    { value: 'ALL', label: 'All severities' },
    { value: 'CRITICAL', label: 'Critical (60+ days)' },
    { value: 'SERIOUS', label: 'Serious (30-59 days)' },
    { value: 'WARNING', label: 'Warning (15-29 days)' },
    { value: 'EARLY', label: 'Early (under 15 days)' },
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
        case 'EARLY':
            return daysOverdue < 15;
        default:
            return true;
    }
}

/**
 * The escalation ladder a school is expected to follow by hand. These are
 * reference bands, not automation: nothing in this deployment watches the clock
 * and sends anything. They are shown so the severity labels on the list below
 * have a stated meaning, and they are labelled as manual throughout.
 */
const ESCALATION_POLICY = [
    { threshold: '7+ days', step: 'Gentle reminder', tone: 'border-gray-200 dark:border-gray-800' },
    { threshold: '15+ days', step: 'Warning notice', tone: 'border-amber-300 dark:border-amber-900/60' },
    { threshold: '30+ days', step: 'Final notice', tone: 'border-orange-300 dark:border-orange-900/60' },
    { threshold: '60+ days', step: 'Escalate to principal', tone: 'border-red-300 dark:border-red-900/60' },
] as const;

/** The invoice workspace matches students by name via its `?q=` search. */
function studentInvoicesHref(studentName: string): string {
    return `/invoices?q=${encodeURIComponent(studentName)}`;
}

export default function DefaulterAlertsView({ stats, defaulters }: DefaulterAlertsViewProps) {
    const [severity, setSeverity] = useState<SeverityFilter>('ALL');
    const visibleDefaulters = defaulters.filter((d) => matchesSeverity(d.daysOverdue, severity));
    /** The list query is capped; the counts above are not. Say so rather than
     *  letting the table imply it holds every overdue student. */
    const truncated = defaulters.length < stats.total;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Overdue Fee Watchlist</h1>
                <p className="text-muted-foreground mt-1">
                    Students with invoices past their due date, graded by how long the oldest one has been
                    outstanding.
                </p>
            </div>

            {/* The one thing a reader must not get wrong about this page. */}
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                <div className="flex gap-3">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                            Nothing on this page is sent automatically.
                        </p>
                        <p className="text-muted-foreground">
                            This is a read-only watchlist. No reminder job runs against it, so a student staying
                            on the list does not mean a notice went out. Reminders have to be sent by hand
                            (letter, call, or the messaging module) until a notification provider and a scheduler
                            are wired up for this deployment.
                        </p>
                    </div>
                </div>
            </div>

            {/* Counts — all measured from overdue invoices */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Students overdue</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <span className="text-sm text-red-600 dark:text-red-400">Critical (60+ days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-red-700 dark:text-red-300">{stats.critical}</div>
                    </CardContent>
                </Card>
                <Card className="border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-orange-500" />
                            <span className="text-sm text-orange-600 dark:text-orange-400">Serious (30-59 days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-orange-700 dark:text-orange-300">{stats.serious}</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-amber-500" />
                            <span className="text-sm text-amber-600 dark:text-amber-400">Warning (15-29 days)</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">{stats.warning}</div>
                    </CardContent>
                </Card>
                <Card className="border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <IndianRupee className="h-5 w-5 text-indigo-500" />
                            <span className="text-sm text-indigo-600 dark:text-indigo-400">Total overdue</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-indigo-700 dark:text-indigo-300">
                            {formatCurrency(stats.totalAmount)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Escalation policy — reference only */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Escalation policy (reference)</CardTitle>
                    <CardDescription>
                        The ladder the severity labels below refer to. Each step is a manual action for the fees
                        team — the system does not perform any of them.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        {ESCALATION_POLICY.map((rule) => (
                            <div key={rule.threshold} className={`p-3 border rounded-lg ${rule.tone}`}>
                                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {rule.threshold}
                                </div>
                                <Badge variant="outline" className="mt-1 font-normal">
                                    {rule.step}
                                </Badge>
                                <div className="text-[11px] text-muted-foreground mt-2">Sent manually</div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Watchlist */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg">Watchlist</CardTitle>
                            <CardDescription>
                                {severity === 'ALL'
                                    ? `${defaulters.length} student${defaulters.length === 1 ? '' : 's'} with overdue fees`
                                    : `${visibleDefaulters.length} of ${defaulters.length} students in this severity band`}
                                {truncated
                                    ? ` · longest-overdue ${defaulters.length} of ${stats.total} shown`
                                    : ''}
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
                            <p className="text-lg font-medium">No overdue fees</p>
                            <p className="text-sm">Every issued invoice is either settled or not yet due.</p>
                        </div>
                    ) : visibleDefaulters.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-medium">Nobody in this severity band</p>
                            <p className="text-sm">
                                {defaulters.length} student{defaulters.length === 1 ? '' : 's'} fall outside the
                                selected filter. Choose “All severities” to see them.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Class</TableHead>
                                        <TableHead className="text-right">Amount due</TableHead>
                                        <TableHead className="text-right">Days overdue</TableHead>
                                        <TableHead>Severity</TableHead>
                                        <TableHead className="text-right">Overdue invoices</TableHead>
                                        <TableHead className="text-right">Open</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleDefaulters.map((defaulter) => {
                                        const sev = getSeverity(defaulter.daysOverdue);
                                        return (
                                            <TableRow key={defaulter.studentId}>
                                                <TableCell className="font-medium">{defaulter.studentName}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {defaulter.className}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {formatCurrency(defaulter.balance)}
                                                </TableCell>
                                                <TableCell className="text-right">{defaulter.daysOverdue}</TableCell>
                                                <TableCell>
                                                    <Badge variant={sev.variant}>
                                                        <sev.icon className="h-3 w-3 mr-1" />
                                                        {sev.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {defaulter.invoiceCount}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" variant="outline" asChild>
                                                        <Link
                                                            href={studentInvoicesHref(defaulter.studentName)}
                                                            title={`View all invoices for ${defaulter.studentName}`}
                                                        >
                                                            <FileText className="h-3 w-3 mr-1" />
                                                            Invoices
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
