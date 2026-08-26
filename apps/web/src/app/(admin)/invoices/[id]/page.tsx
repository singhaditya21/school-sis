import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getInvoiceDetail } from '@/lib/actions/queries';
import { RecordPaymentForm } from '@/components/fees/record-payment-form';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type PaymentRow = {
    id: string;
    amount: string;
    method: string;
    status: string;
    reference: string | null;
    chequeNumber: string | null;
    bankName: string | null;
    createdAt: string | Date;
    receiptId: string | null;
    receiptNumber: string | null;
};

type LineItem = { name: string; amount: string; frequency: string; isOptional: boolean };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const invoice = await getInvoiceDetail(id);

    if (!invoice) notFound();

    const total = Number(invoice.totalAmount);
    const paid = Number(invoice.paidAmount);
    const balance = total - paid;
    const payments = (invoice.payments ?? []) as PaymentRow[];
    const lineItems = (invoice.lineItems ?? []) as LineItem[];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link href="/invoices" className="text-sm text-muted-foreground hover:underline">
                        ← All invoices
                    </Link>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
                    <p className="text-muted-foreground">
                        {invoice.studentName} · due {String(invoice.dueDate).slice(0, 10)}
                    </p>
                </div>
                <Badge className="text-sm">{invoice.status}</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2"><CardDescription>Total billed</CardDescription></CardHeader>
                    <CardContent className="text-2xl font-semibold tabular-nums">{formatCurrency(total)}</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardDescription>Paid</CardDescription></CardHeader>
                    <CardContent className="text-2xl font-semibold tabular-nums text-green-600">{formatCurrency(paid)}</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardDescription>Balance due</CardDescription></CardHeader>
                    <CardContent className={`text-2xl font-semibold tabular-nums ${balance > 0 ? 'text-red-600' : ''}`}>
                        {formatCurrency(balance)}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Record a payment</CardTitle>
                    <CardDescription>
                        For cash, cheque, UPI or card taken at the counter. A receipt is issued automatically.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <RecordPaymentForm invoiceId={invoice.id} balanceDue={balance} />
                </CardContent>
            </Card>

            {lineItems.length > 0 && (
                <Card>
                    <CardHeader><CardTitle>Fee breakdown</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Component</TableHead>
                                    <TableHead>Frequency</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lineItems.map((item, i) => (
                                    <TableRow key={`${item.name}-${i}`}>
                                        <TableCell>{item.name}{item.isOptional ? ' (optional)' : ''}</TableCell>
                                        <TableCell className="text-muted-foreground">{item.frequency}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCurrency(Number(item.amount))}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Payment history</CardTitle>
                    <CardDescription>{payments.length} recorded</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Receipt</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.map((payment) => (
                                <TableRow key={payment.id}>
                                    <TableCell>{String(payment.createdAt).slice(0, 10)}</TableCell>
                                    <TableCell>{payment.method}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {payment.reference || payment.chequeNumber || '—'}
                                        {payment.bankName ? ` · ${payment.bankName}` : ''}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(payment.amount))}</TableCell>
                                    <TableCell>
                                        {payment.receiptId ? (
                                            <Link href={`/receipts/${payment.receiptId}`} className="hover:underline">
                                                {payment.receiptNumber}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {payments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                        Nothing collected against this invoice yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
