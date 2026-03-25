'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMyFees } from '@/lib/actions/scaffolding-bridge';

export default function MyFeesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');

    useEffect(() => { getMyFees().then(data => { setInvoices(data.invoices as any[]); setPayments(data.payments as any[]); }); }, []);

    const totalDue = invoices.filter(i => i.status !== 'PAID').reduce((sum: number, i: any) => sum + Number(i.amount || 0) - Number(i.paidAmount || 0), 0);
    const getStatusColor = (s: string) => ({ PAID: 'bg-green-100 text-green-700', PENDING: 'bg-yellow-100 text-yellow-700', OVERDUE: 'bg-red-100 text-red-700' }[s] || 'bg-gray-100 text-gray-700');

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">My Fees</h1><p className="text-gray-600 mt-1">View your fee details and payment history</p></div>

            <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Outstanding</div><div className="text-3xl font-bold text-orange-600">₹{totalDue.toLocaleString()}</div></CardContent></Card>

            <div className="flex gap-2">
                <button onClick={() => setTab('invoices')} className={`px-6 py-3 rounded-lg font-medium ${tab === 'invoices' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>📄 Invoices</button>
                <button onClick={() => setTab('payments')} className={`px-6 py-3 rounded-lg font-medium ${tab === 'payments' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>💳 Payments</button>
            </div>

            {tab === 'invoices' ? (
                <Card><CardHeader><CardTitle>Fee Invoices</CardTitle></CardHeader><CardContent>
                    {invoices.length === 0 ? <p className="text-gray-500 text-center py-8">No invoices found.</p> : (
                        <table className="w-full"><thead className="bg-gray-50"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr></thead><tbody className="divide-y">
                            {invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{inv.invoiceNo}</td>
                                    <td className="px-4 py-3">{inv.description}</td>
                                    <td className="px-4 py-3 text-right font-medium">₹{Number(inv.amount).toLocaleString()}</td>
                                    <td className="px-4 py-3">{inv.dueDate}</td>
                                    <td className="px-4 py-3"><Badge className={getStatusColor(inv.status)}>{inv.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody></table>
                    )}
                </CardContent></Card>
            ) : (
                <Card><CardHeader><CardTitle>Payment History</CardTitle></CardHeader><CardContent>
                    {payments.length === 0 ? <p className="text-gray-500 text-center py-8">No payments recorded.</p> : (
                        <table className="w-full"><thead className="bg-gray-50"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr></thead><tbody className="divide-y">
                            {payments.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{p.receiptNo}</td>
                                    <td className="px-4 py-3 text-right font-medium text-green-600">₹{Number(p.amount).toLocaleString()}</td>
                                    <td className="px-4 py-3"><Badge variant="outline">{p.method}</Badge></td>
                                    <td className="px-4 py-3">{p.paidAt}</td>
                                    <td className="px-4 py-3"><Badge className="bg-green-100 text-green-700">{p.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody></table>
                    )}
                </CardContent></Card>
            )}
        </div>
    );
}
