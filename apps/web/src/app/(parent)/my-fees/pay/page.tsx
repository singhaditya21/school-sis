'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import {
    createCheckoutSession,
    getOnlinePaymentCapabilities,
} from '@/lib/actions/payments';
import { openRazorpayCheckoutModal } from '@/lib/payments/razorpay-browser';
import { getInvoiceForCheckout, type CheckoutInvoice } from '../../actions';

export default function PaymentCheckoutPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const invoiceId = searchParams.get('invoiceId') || '';
    const [processing, setProcessing] = useState<'RAZORPAY' | 'STRIPE' | null>(null);
    const [capabilities, setCapabilities] = useState<{
        razorpayReady: boolean;
        stripeConnectReady: boolean;
    } | null>(null);
    const [fetched, setFetched] = useState<{ key: string; invoice: CheckoutInvoice | null } | null>(null);

    useEffect(() => {
        let cancelled = false;
        getOnlinePaymentCapabilities()
            .then((caps) => {
                if (!cancelled) setCapabilities(caps);
            })
            .catch(() => {
                if (!cancelled) setCapabilities({ razorpayReady: false, stripeConnectReady: false });
            });
        return () => {
            cancelled = true;
        };
    }, []);

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

    async function payViaRazorpayUpi() {
        if (!invoiceId || !invoice) {
            toast.error('No invoice was selected.');
            return;
        }
        setProcessing('RAZORPAY');
        try {
            const orderRes = await fetch('/api/payments/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceId,
                    description: `Invoice ${invoice.invoiceNumber} · ${invoice.studentName}`,
                }),
            });
            const orderPayload = (await orderRes.json().catch(() => ({}))) as {
                success?: boolean;
                error?: string;
                data?: {
                    orderId: string;
                    amount: number;
                    currency: string;
                    keyId: string;
                    description: string;
                };
            };

            if (!orderRes.ok || !orderPayload.success || !orderPayload.data) {
                throw new Error(orderPayload.error || 'Online UPI payment gateway is not configured yet.');
            }

            const { orderId, amount, currency, keyId, description } = orderPayload.data;

            await openRazorpayCheckoutModal({
                keyId,
                orderId,
                amountMinor: amount,
                currency,
                schoolName: 'ScholarMind Fee Desk',
                description,
                onSuccess: async (rzpResponse) => {
                    const verifyRes = await fetch('/api/payments/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            invoiceId,
                            razorpayOrderId: rzpResponse.razorpay_order_id,
                            razorpayPaymentId: rzpResponse.razorpay_payment_id,
                            razorpaySignature: rzpResponse.razorpay_signature,
                        }),
                    });
                    const verifyPayload = (await verifyRes.json().catch(() => ({}))) as {
                        success?: boolean;
                        error?: string;
                    };
                    if (!verifyRes.ok || !verifyPayload.success) {
                        toast.error(verifyPayload.error || 'Payment verification pending webhook confirmation.');
                        setProcessing(null);
                        return;
                    }
                    toast.success('Fee payment verified! Official receipt generated.');
                    router.push('/my-fees?success=true');
                },
                onDismiss: () => {
                    setProcessing(null);
                },
                onError: (msg) => {
                    toast.error(msg);
                    setProcessing(null);
                },
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Payment checkout is unavailable.');
            setProcessing(null);
        }
    }

    async function continueToStripeCard() {
        if (!invoiceId) {
            toast.error('No invoice was selected.');
            return;
        }
        setProcessing('STRIPE');

        try {
            const { url } = await createCheckoutSession(invoiceId);
            if (!url) throw new Error('The payment provider did not return a checkout URL.');
            window.location.assign(url);
        } catch {
            toast.error('Payment checkout is unavailable. No payment was recorded.');
            setProcessing(null);
        }
    }

    const payable = invoice !== null && invoice.balance > 0 && invoice.status !== 'PAID';
    const razorpayReady = capabilities?.razorpayReady ?? false;
    const stripeReady = capabilities?.stripeConnectReady ?? false;

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted p-6">
            <Card className="w-full max-w-xl border-border shadow-lg">
                <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">UPI · NetBanking · RuPay · Cards</Badge>
                        <Badge variant="secondary">Instant Official Receipt</Badge>
                    </div>
                    <CardTitle className="text-2xl">Continue to secure fee payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                        ScholarMind never stores card numbers, CVVs, UPI PINs, or bank credentials.
                        Payments are processed directly by RBI-compliant / PCI-DSS gateways and reconciled automatically into your child&apos;s fee ledger.
                    </p>

                    <div className="rounded-lg border border-border bg-muted p-4">
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading invoice…</p>
                        ) : invoice ? (
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Invoice</dt>
                                    <dd className="font-mono text-foreground">{invoice.invoiceNumber}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Student</dt>
                                    <dd className="text-foreground">{invoice.studentName}</dd>
                                </div>
                                {invoice.description && (
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">For</dt>
                                        <dd className="text-foreground">{invoice.description}</dd>
                                    </div>
                                )}
                                {invoice.dueDate && (
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Due</dt>
                                        <dd className="text-foreground">{invoice.dueDate}</dd>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-border pt-2">
                                    <dt className="font-medium text-foreground">Balance Due</dt>
                                    <dd className="text-lg font-semibold tabular-nums text-foreground">
                                        {formatCurrency(invoice.balance)}
                                    </dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {invoiceId
                                    ? 'This invoice is not available on your account.'
                                    : 'No invoice was selected.'}
                            </p>
                        )}
                    </div>

                    {invoice && !payable && (
                        <p className="rounded-lg border border-success/30 bg-success-subtle p-3 text-sm text-success-subtle-foreground">
                            Nothing is outstanding on this invoice.
                        </p>
                    )}

                    <div className="space-y-3">
                        <Button
                            type="button"
                            data-testid="pay-upi-razorpay-button"
                            disabled={!payable || processing !== null}
                            onClick={razorpayReady ? payViaRazorpayUpi : continueToStripeCard}
                            className="w-full py-6 text-base font-semibold"
                        >
                            {processing === 'RAZORPAY'
                                ? 'Opening UPI / NetBanking checkout…'
                                : processing === 'STRIPE'
                                    ? 'Redirecting to card checkout…'
                                    : razorpayReady
                                        ? 'Pay via UPI (GPay / PhonePe / Paytm), NetBanking or Card'
                                        : 'Continue to online payment'}
                        </Button>

                        {razorpayReady && stripeReady && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!payable || processing !== null}
                                onClick={continueToStripeCard}
                                className="w-full"
                            >
                                Pay with International Card (Stripe)
                            </Button>
                        )}

                        {capabilities && !razorpayReady && !stripeReady && payable && (
                            <p className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
                                Online gateway credentials are being activated by your school office. You may also pay at the school fee counter for an instant receipt.
                            </p>
                        )}
                    </div>

                    <div className="text-center">
                        <Link href="/my-fees" className="text-sm text-muted-foreground hover:underline">
                            ← Back to fees
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
