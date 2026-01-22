'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Bell,
    AlertTriangle,
    Clock,
    Send,
    Filter,
    RefreshCw,
    Users,
    IndianRupee
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Defaulter {
    id: string;
    studentName: string;
    className: string;
    parentPhone: string;
    amountDue: number;
    daysOverdue: number;
    lastReminder: string | null;
    reminderCount: number;
}

export default function DefaulterAlertsPage() {
    const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState({
        total: 0,
        critical: 0,
        serious: 0,
        warning: 0,
        totalAmount: 0
    });

    useEffect(() => {
        // Mock data
        setDefaulters([
            { id: '1', studentName: 'Arjun Mehta', className: '8A', parentPhone: '98765xxxxx', amountDue: 45000, daysOverdue: 65, lastReminder: '2026-01-15', reminderCount: 3 },
            { id: '2', studentName: 'Kavya Singh', className: '5B', parentPhone: '98234xxxxx', amountDue: 28000, daysOverdue: 35, lastReminder: '2026-01-18', reminderCount: 2 },
            { id: '3', studentName: 'Rohan Gupta', className: '10A', parentPhone: '99876xxxxx', amountDue: 52000, daysOverdue: 22, lastReminder: '2026-01-19', reminderCount: 1 },
            { id: '4', studentName: 'Ananya Das', className: '3C', parentPhone: '97654xxxxx', amountDue: 18000, daysOverdue: 10, lastReminder: null, reminderCount: 0 },
        ]);
        setStats({
            total: 156,
            critical: 23,
            serious: 45,
            warning: 88,
            totalAmount: 4250000
        });
    }, []);

    const getStatus = (daysOverdue: number) => {
        if (daysOverdue >= 60) return { label: 'Critical', variant: 'destructive' as const, icon: AlertTriangle };
        if (daysOverdue >= 30) return { label: 'Serious', variant: 'default' as const, icon: Clock };
        if (daysOverdue >= 15) return { label: 'Warning', variant: 'secondary' as const, icon: Bell };
        return { label: 'Reminder', variant: 'outline' as const, icon: Bell };
    };

    const handleProcessDefaulters = async () => {
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsProcessing(false);
        alert('Reminders sent successfully!');
    };

    const handleSendReminder = async (defaulterId: string) => {
        // In production, call API
        alert(`Reminder sent for defaulter ${defaulterId}`);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Defaulter Alerts</h1>
                    <p className="text-muted-foreground">Automated fee reminder and escalation management</p>
                </div>
                <Button onClick={handleProcessDefaulters} disabled={isProcessing}>
                    {isProcessing ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4 mr-2" />
                    )}
                    Process & Send Reminders
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
                            <CardDescription>Students with overdue fee payments</CardDescription>
                        </div>
                        <Button variant="outline" size="sm">
                            <Filter className="h-4 w-4 mr-2" />
                            Filter
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Class</TableHead>
                                <TableHead>Amount Due</TableHead>
                                <TableHead>Days Overdue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reminders Sent</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {defaulters.map((defaulter) => {
                                const status = getStatus(defaulter.daysOverdue);
                                return (
                                    <TableRow key={defaulter.id}>
                                        <TableCell className="font-medium">{defaulter.studentName}</TableCell>
                                        <TableCell>{defaulter.className}</TableCell>
                                        <TableCell className="font-semibold">₹{defaulter.amountDue.toLocaleString()}</TableCell>
                                        <TableCell>{defaulter.daysOverdue} days</TableCell>
                                        <TableCell>
                                            <Badge variant={status.variant}>
                                                <status.icon className="h-3 w-3 mr-1" />
                                                {status.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{defaulter.reminderCount}</TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="outline" onClick={() => handleSendReminder(defaulter.id)}>
                                                <Send className="h-3 w-3 mr-1" />
                                                Send Reminder
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
