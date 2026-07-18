'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getMyFees, ParentFeeResponse } from '@/lib/services/parent/parent.service';
import { createCheckoutSession } from '@/lib/actions/payments';
import { toast } from 'sonner';

export default function MyFeesPage() {
    const [data, setData] = useState<ParentFeeResponse>({ invoices: [], payments: [] });
    const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
    const [loading, setLoading] = useState(true);

    useEffect(() => { 
        getMyFees().then(res => { 
            setData(res); 
            setLoading(false); 
        }); 
    }, []);

    const invoices = data.invoices;
    const payments = data.payments;
    
    const totalDue = invoices.filter(i => i.status !== 'PAID').reduce((sum, i) => sum + i.amount - i.paidAmount, 0);
    const getStatusColor = (s: string) => ({ PAID: 'bg-green-100 text-green-700', PENDING: 'bg-yellow-100 text-yellow-700', OVERDUE: 'bg-red-100 text-red-700' }[s] || 'bg-gray-100 text-gray-700');

    const handlePay = async (invoiceId: string) => {
        try {
            const { url } = await createCheckoutSession(invoiceId);
            if (url) window.location.href = url;
        } catch (error) {
            console.error('Payment error', error);
            toast.error('Failed to initiate payment. Please try again later.');
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">My Fees</h1>
                <p className="text-gray-600 mt-1">View your fee details and payment history</p>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Outstanding</div>
                    <div className="text-4xl font-bold text-orange-600 mt-2">₹{totalDue.toLocaleString()}</div>
                </CardContent>
            </Card>

            <div className="flex gap-2">
                <button onClick={() => setTab('invoices')} className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${tab === 'invoices' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>📄 Invoices</button>
                <button onClick={() => setTab('payments')} className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${tab === 'payments' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>💳 Payments</button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading fee records...</div>
            ) : tab === 'invoices' ? (
                <Card>
                    <CardHeader><CardTitle className="text-lg">Fee Invoices</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        {invoices.length === 0 ? <p className="text-gray-500 text-center py-12">No invoices found.</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead>Student</TableHead>
                                        <TableHead>Invoice No</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Paid</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((inv) => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-medium text-slate-900">{inv.studentName}</TableCell>
                                            <TableCell className="font-mono text-slate-500 text-xs">{inv.invoiceNo}</TableCell>
                                            <TableCell>{inv.description}</TableCell>
                                            <TableCell className="text-right font-medium">₹{inv.amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right text-emerald-600">₹{inv.paidAmount.toLocaleString()}</TableCell>
                                            <TableCell>{inv.dueDate}</TableCell>
                                            <TableCell>
                                                <Badge className={`${getStatusColor(inv.status)} hover:bg-opacity-80`}>{inv.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {inv.status !== 'PAID' && (
                                                    <Button size="sm" onClick={() => handlePay(inv.id)} className="bg-slate-900 text-white hover:bg-slate-800">
                                                        Pay Now
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
            ) : (
                <Card>
                    <CardHeader><CardTitle className="text-lg">Payment History</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        {payments.length === 0 ? <p className="text-gray-500 text-center py-12">No payments recorded.</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead>Student</TableHead>
                                        <TableHead>Receipt No</TableHead>
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
                                            <TableCell className="font-medium text-slate-900">{p.studentName}</TableCell>
                                            <TableCell className="font-mono text-slate-500 text-xs">{p.receiptNo}</TableCell>
                                            <TableCell className="font-mono text-slate-500 text-xs">{p.invoiceNo}</TableCell>
                                            <TableCell className="text-right font-medium text-emerald-600">₹{p.amount.toLocaleString()}</TableCell>
                                            <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                                            <TableCell>{p.paidAt}</TableCell>
                                            <TableCell><Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">{p.status}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
