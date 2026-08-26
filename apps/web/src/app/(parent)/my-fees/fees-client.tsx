'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { useParentChildren } from '@/components/parent/use-parent-children';
import { getChildFees, type ChildFees } from '../actions';
import { createCheckoutSession } from '@/lib/actions/payments';

function statusClass(status: string): string {
    switch (status) {
        case 'PAID':
        case 'COMPLETED':
            return 'bg-emerald-100 text-emerald-700';
        case 'OVERDUE':
            return 'bg-red-100 text-red-700';
        case 'PARTIAL':
            return 'bg-blue-100 text-blue-700';
        case 'PENDING':
            return 'bg-amber-100 text-amber-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

export function FeesClient() {
    const { students, selectedId, loading: childrenLoading, error: childrenError } = useParentChildren();
    const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
    const [payingId, setPayingId] = useState<string | null>(null);

    // Keyed by child so a slow response for one child can never be rendered
    // under another child's name.
    const [fetched, setFetched] = useState<{ key: string; data: ChildFees | null } | null>(null);

    useEffect(() => {
        if (childrenLoading || !selectedId) return;

        let cancelled = false;
        const key = selectedId;
        getChildFees(selectedId)
            .then((res) => {
                if (!cancelled) setFetched({ key, data: res });
            })
            .catch(() => {
                if (cancelled) return;
                setFetched({ key, data: null });
                toast.error('Could not load fee records.');
            });

        return () => {
            cancelled = true;
        };
    }, [selectedId, childrenLoading]);

    const current = fetched?.key === selectedId ? fetched : null;
    const data = current?.data ?? null;
    const loading = childrenLoading || (selectedId !== null && current === null);

    const handlePay = useCallback(async (invoiceId: string) => {
        setPayingId(invoiceId);
        try {
            const { url } = await createCheckoutSession(invoiceId);
            if (!url) throw new Error('No checkout URL returned');
            window.location.assign(url);
        } catch {
            toast.error('Could not open the payment provider. No payment was recorded.');
            setPayingId(null);
        }
    }, []);

    const invoices = data?.invoices ?? [];
    const payments = data?.payments ?? [];
    const totalDue = invoices.reduce((sum, i) => (i.status === 'PAID' ? sum : sum + i.balance), 0);
    const overdue = invoices.filter((i) => i.isOverdue);

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-12">
            <ParentTopBar students={students} selectedId={selectedId} loading={childrenLoading} />

            <div>
                <h1 className="text-2xl font-bold tracking-tight">Fees</h1>
                <p className="mt-1 text-sm text-slate-500">
                    {data ? `Invoices and payments for ${data.child.name}` : 'Invoices and payments'}
                </p>
            </div>

            {childrenError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {childrenError}
                </div>
            )}

            {!childrenLoading && students.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-white p-12 text-center text-slate-500">
                    No child is linked to your account yet, so there are no fee records to show.
                </div>
            ) : (
                <>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-sm font-medium uppercase tracking-wider text-slate-500">
                                Total outstanding
                            </div>
                            <div className="mt-2 text-4xl font-bold text-orange-600">
                                {loading ? '—' : formatCurrency(totalDue)}
                            </div>
                            {!loading && overdue.length > 0 && (
                                <p className="mt-2 text-sm font-medium text-red-600">
                                    {overdue.length} invoice{overdue.length === 1 ? '' : 's'} past the due date
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setTab('invoices')}
                            className={`rounded-md px-6 py-2.5 text-sm font-medium transition-colors ${
                                tab === 'invoices'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            Invoices
                        </button>
                        <button
                            onClick={() => setTab('payments')}
                            className={`rounded-md px-6 py-2.5 text-sm font-medium transition-colors ${
                                tab === 'payments'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            Payments
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-12 text-center text-slate-500">Loading fee records…</div>
                    ) : tab === 'invoices' ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Fee invoices</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {invoices.length === 0 ? (
                                    <p className="py-12 text-center text-slate-500">No invoices raised yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-slate-50">
                                                    <TableHead>Invoice</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                    <TableHead className="text-right">Paid</TableHead>
                                                    <TableHead className="text-right">Balance</TableHead>
                                                    <TableHead>Due</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {invoices.map((inv) => (
                                                    <TableRow key={inv.id}>
                                                        <TableCell className="font-mono text-xs text-slate-500">
                                                            {inv.invoiceNumber}
                                                        </TableCell>
                                                        <TableCell>{inv.description ?? '—'}</TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(inv.totalAmount)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-emerald-600">
                                                            {formatCurrency(inv.paidAmount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(inv.balance)}
                                                        </TableCell>
                                                        <TableCell
                                                            className={inv.isOverdue ? 'font-medium text-red-600' : ''}
                                                        >
                                                            {inv.dueDate ?? '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className={statusClass(inv.status)}>
                                                                {inv.isOverdue && inv.status !== 'OVERDUE'
                                                                    ? `${inv.status} · OVERDUE`
                                                                    : inv.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {inv.status !== 'PAID' && inv.balance > 0 && (
                                                                <Button
                                                                    size="sm"
                                                                    disabled={payingId === inv.id}
                                                                    onClick={() => handlePay(inv.id)}
                                                                    className="bg-slate-900 text-white hover:bg-slate-800"
                                                                >
                                                                    {payingId === inv.id ? 'Opening…' : 'Pay now'}
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Payment history</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {payments.length === 0 ? (
                                    <p className="py-12 text-center text-slate-500">No payments recorded yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-slate-50">
                                                    <TableHead>Receipt</TableHead>
                                                    <TableHead>Invoice</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                    <TableHead>Method</TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {payments.map((p) => (
                                                    <TableRow key={p.id}>
                                                        <TableCell className="font-mono text-xs text-slate-500">
                                                            {p.receiptNumber ?? 'Not issued'}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs text-slate-500">
                                                            {p.invoiceNumber}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium text-emerald-600">
                                                            {formatCurrency(p.amount)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{p.method}</Badge>
                                                        </TableCell>
                                                        <TableCell>{p.paidAt ?? '—'}</TableCell>
                                                        <TableCell>
                                                            <Badge className={statusClass(p.status)}>{p.status}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
