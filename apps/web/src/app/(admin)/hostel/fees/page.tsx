'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getHostelFees } from '@/lib/services/hostel/hostel.service';
import { formatCurrency } from '@/lib/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { markHostelFeePaid } from './actions';

interface HostelFee {
    id: string;
    studentId: string;
    studentName: string;
    class: string | null;
    hostelName: string | null;
    roomNumber: string | null;
    feeType: string;
    amount: number;
    dueDate: string | null;
    status: string;
    paidDate: string | null;
}

const STATUS_STYLES: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    overdue: 'bg-red-100 text-red-800',
};

const FEE_TYPE_STYLES: Record<string, string> = {
    hostel: 'bg-blue-100 text-blue-800',
    mess: 'bg-purple-100 text-purple-800',
    caution: 'bg-orange-100 text-orange-800',
};

export default function HostelFeesPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [feeTypeFilter, setFeeTypeFilter] = useState('');
    const [fees, setFees] = useState<HostelFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await getHostelFees(statusFilter || undefined, feeTypeFilter || undefined);
            setFees(rows as HostelFee[]);
            setLoadError(null);
        } catch {
            setFees([]);
            setLoadError('Hostel fee records could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, feeTypeFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const collected = fees.filter((f) => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0);
    const pending = fees.filter((f) => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0);
    const overdue = fees.filter((f) => f.status === 'overdue').reduce((sum, f) => sum + f.amount, 0);
    const totalDue = fees.filter((f) => f.status !== 'paid').reduce((sum, f) => sum + f.amount, 0);

    const handleMarkPaid = (fee: HostelFee) => {
        setBusyId(fee.id);
        startTransition(async () => {
            const result = await markHostelFeePaid(fee.id);
            setBusyId(null);
            if (!result.success) {
                toast.error(result.error ?? 'Could not update that fee record.');
                return;
            }
            toast.success(`${fee.studentName} — ${fee.feeType} fee marked paid`);
            await load();
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hostel Fees</h1>
                    <p className="text-muted-foreground">Hostel, mess and caution deposit records</p>
                </div>
                <Link href="/hostel"><Button variant="outline">← Back to Hostel</Button></Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Collected</CardDescription><CardTitle className="text-3xl text-green-600" data-testid="kpi-collected">{formatCurrency(collected)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Pending</CardDescription><CardTitle className="text-3xl text-yellow-600" data-testid="kpi-pending">{formatCurrency(pending)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Overdue</CardDescription><CardTitle className="text-3xl text-red-600" data-testid="kpi-overdue">{formatCurrency(overdue)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Total Outstanding</CardDescription><CardTitle className="text-3xl" data-testid="kpi-outstanding">{formatCurrency(totalDue)}</CardTitle></CardHeader></Card>
            </div>
            <p className="text-xs text-muted-foreground -mt-3">
                Totals cover the records listed below — the most recent 100 matching the filters, not the full year.
            </p>

            <Card><CardContent className="p-4"><div className="flex flex-wrap gap-4">
                <select
                    className="p-2 border rounded-md"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                    data-testid="filter-status"
                >
                    <option value="">All Status</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                </select>
                <select
                    className="p-2 border rounded-md"
                    value={feeTypeFilter}
                    onChange={(e) => setFeeTypeFilter(e.target.value)}
                    aria-label="Filter by fee type"
                    data-testid="filter-fee-type"
                >
                    <option value="">All Fee Types</option>
                    <option value="hostel">Hostel Fee</option>
                    <option value="mess">Mess Fee</option>
                    <option value="caution">Caution Deposit</option>
                </select>
                <Button variant="outline" onClick={() => { setStatusFilter(''); setFeeTypeFilter(''); }}>Clear</Button>
            </div></CardContent></Card>

            <Card>
                <CardHeader>
                    <CardTitle>Fee Records</CardTitle>
                    <CardDescription>
                        Reminders and receipts are not available for hostel fees in this release — marking a
                        record paid updates its status and payment date only.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadError ? (
                        <p className="text-red-600 text-center py-8" data-testid="fees-load-error">{loadError}</p>
                    ) : loading ? (
                        <p className="text-gray-500 text-center py-8" data-testid="fees-loading">Loading fee records…</p>
                    ) : fees.length === 0 ? (
                        <p className="text-gray-500 text-center py-8" data-testid="no-fee-records">No fee records found.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Hostel / Room</TableHead>
                                    <TableHead>Fee Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fees.map((fee) => (
                                    <TableRow key={fee.id} data-testid={`fee-row-${fee.id}`}>
                                        <TableCell>
                                            <p className="font-medium">{fee.studentName}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {fee.studentId}{fee.class ? ` | ${fee.class}` : ''}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <p>{fee.hostelName ?? 'No active allocation'}</p>
                                            {fee.roomNumber && <p className="text-sm text-muted-foreground">Room {fee.roomNumber}</p>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={FEE_TYPE_STYLES[fee.feeType] ?? 'bg-gray-100 text-gray-800'}>{fee.feeType}</Badge>
                                        </TableCell>
                                        <TableCell className="font-medium text-right" data-testid={`fee-amount-${fee.id}`}>{formatCurrency(fee.amount)}</TableCell>
                                        <TableCell>{fee.dueDate ?? '—'}</TableCell>
                                        <TableCell>
                                            <Badge className={STATUS_STYLES[fee.status] ?? 'bg-gray-100 text-gray-800'} data-testid={`fee-status-${fee.id}`}>{fee.status}</Badge>
                                            {fee.paidDate && (
                                                <p className="text-xs text-muted-foreground mt-1">Paid: {fee.paidDate}</p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {fee.status === 'paid' ? (
                                                <span className="text-sm text-muted-foreground">Settled</span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleMarkPaid(fee)}
                                                    disabled={isPending && busyId === fee.id}
                                                    data-testid={`fee-mark-paid-${fee.id}`}
                                                >
                                                    {isPending && busyId === fee.id ? 'Saving…' : 'Mark Paid'}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
