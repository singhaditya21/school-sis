'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createCheckoutSession } from '@/lib/actions/payments';

export default function PaymentCheckoutPage() {
    const searchParams = useSearchParams();
    const invoiceId = searchParams.get('invoiceId') || '';
    const [processing, setProcessing] = useState(false);

    async function continueToProvider() {
        if (!invoiceId) {
            toast.error('No invoice ID provided.');
            return;
        }
        setProcessing(true);

        try {
            const { url } = await createCheckoutSession(invoiceId);
            if (!url) throw new Error('The payment provider did not return a checkout URL.');
            window.location.assign(url);
        } catch (error) {
            console.error('Payment checkout error:', error);
            toast.error('Payment checkout is unavailable. No payment was recorded.');
            setProcessing(false);
        }
    }

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
                        <p className="text-sm font-medium text-slate-500">Invoice</p>
                        <p className="mt-1 break-all font-mono text-slate-900">
                            {invoiceId || 'No invoice selected'}
                        </p>
                    </div>
                    <Button
                        type="button"
                        className="h-12 w-full text-base font-semibold"
                        disabled={processing || !invoiceId}
                        onClick={continueToProvider}
                    >
                        {processing ? 'Opening secure provider…' : 'Continue to secure provider'}
                    </Button>
                    <p className="text-center text-xs text-slate-500">
                        A payment is recorded only after a signed provider confirmation succeeds.
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
