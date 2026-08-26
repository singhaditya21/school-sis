'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { createCheckoutSession } from '@/lib/actions/payments';
import { getInvoiceForCheckout, type CheckoutInvoice } from '../../actions';

export default function PaymentCheckoutPage() {
    const searchParams = useSearchParams();
    const invoiceId = searchParams.get('invoiceId') || '';
    const [processing, setProcessing] = useState(false);
    const [fetched, setFetched] = useState<{ key: string; invoice: CheckoutInvoice | null } | null>(null);

    useEffect(() => {
        if (!invoiceId) return;

        let cancelled = false;
        const key = invoiceId;
        getInvoiceForCheckout(invoiceId)
            .then((res) => {
                if (!cancelled) setFetched({ key, invoice: res });
            })
            .catch(() => {
                if (!cancelled) setFetched({ key, invoice: null });
            });

        return () => {
            cancelled = true;
        };
    }, [invoiceId]);

    const current = fetched?.key === invoiceId ? fetched : null;
    const invoice = current?.invoice ?? null;
    const loading = invoiceId !== '' && current === null;

    async function continueToProvider() {
        if (!invoiceId) {
            toast.error('No invoice was selected.');
            return;
        }
        setProcessing(true);

        try {
            const { url } = await createCheckoutSession(invoiceId);
            if (!url) throw new Error('The payment provider did not return a checkout URL.');
            window.location.assign(url);
        } catch {
            toast.error('Payment checkout is unavailable. No payment was recorded.');
            setProcessing(false);
        }
    }

    const payable = invoice !== null && invoice.balance > 0 && invoice.status !== 'PAID';

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
            <Card className="w-full max-w-xl border-slate-200 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl">Continue to secure payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-slate-600">
                        School SIS does not collect card numbers, CVVs, UPI IDs, or bank credentials.
                        Your outstanding amount and permitted payment methods will be confirmed on the
                        configured payment provider&apos;s hosted checkout.
                    </p>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        {loading ? (
                            <p className="text-sm text-slate-500">Loading invoice…</p>
                        ) : invoice ? (
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Invoice</dt>
                                    <dd className="font-mono text-slate-900">{invoice.invoiceNumber}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Student</dt>
                                    <dd className="text-slate-900">{invoice.studentName}</dd>
                                </div>
                                {invoice.description && (
                                    <div className="flex justify-between">
                                        <dt className="text-slate-500">For</dt>
                                        <dd className="text-slate-900">{invoice.description}</dd>
                                    </div>
                                )}
                                {invoice.dueDate && (
                                    <div className="flex justify-between">
                                        <dt className="text-slate-500">Due</dt>
                                        <dd className="text-slate-900">{invoice.dueDate}</dd>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-slate-200 pt-2">
                                    <dt className="font-medium text-slate-700">Balance</dt>
                                    <dd className="text-lg font-semibold text-slate-900">
                                        {formatCurrency(invoice.balance)}
                                    </dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="text-sm text-slate-600">
                                {invoiceId
                                    ? 'This invoice is not available on your account.'
                                    : 'No invoice was selected.'}
                            </p>
                        )}
                    </div>

                    {invoice && !payable && (
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                            Nothing is outstanding on this invoice.
                        </p>
                    )}

                    <Button
                        type="button"
                        className="h-12 w-full text-base font-semibold"
                        disabled={processing || loading || !payable}
                        onClick={continueToProvider}
                    >
                        {processing ? 'Opening secure provider…' : 'Continue to secure provider'}
                    </Button>

                    <p className="text-center text-xs text-slate-500">
                        A payment is recorded only after a signed provider confirmation succeeds.
                    </p>

                    <p className="text-center text-sm">
                        <Link href="/my-fees" className="text-blue-600 hover:underline">
                            Back to fees
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
