'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { openRazorpayCheckoutModal } from '@/lib/payments/razorpay-browser';

export function PayLinkCheckoutClient({
    token,
    payable,
    razorpayConfigured,
    balanceFormatted,
}: {
    token: string;
    payable: boolean;
    razorpayConfigured: boolean;
    balanceFormatted: string;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [paidNow, setPaidNow] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handlePayNow() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/payments/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_order', token }),
            });
            const payload = (await res.json().catch(() => ({}))) as {
                success?: boolean;
                error?: string;
                data?: {
                    orderId: string;
                    amount: number;
                    currency: string;
                    keyId: string;
                    schoolName: string;
                    description: string;
                };
            };

            if (!res.ok || !payload.success || !payload.data) {
                setError(payload.error || 'Unable to start online payment right now.');
                setLoading(false);
                return;
            }

            const { orderId, amount, currency, keyId, schoolName, description } = payload.data;

            await openRazorpayCheckoutModal({
                keyId,
                orderId,
                amountMinor: amount,
                currency,
                schoolName,
                description,
                onSuccess: async (rzpRes) => {
                    const verifyRes = await fetch('/api/payments/link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'verify_payment',
                            token,
                            razorpayOrderId: rzpRes.razorpay_order_id,
                            razorpayPaymentId: rzpRes.razorpay_payment_id,
                            razorpaySignature: rzpRes.razorpay_signature,
                        }),
                    });
                    const verifyPayload = (await verifyRes.json().catch(() => ({}))) as {
                        success?: boolean;
                        error?: string;
                    };
                    if (!verifyRes.ok || !verifyPayload.success) {
                        setError(
                            verifyPayload.error ||
                                'Payment received — receipt reconciliation will complete shortly.',
                        );
                        setLoading(false);
                        return;
                    }
                    setPaidNow(true);
                    setLoading(false);
                    router.refresh();
                },
                onDismiss: () => setLoading(false),
                onError: (msg) => {
                    setError(msg);
                    setLoading(false);
                },
            });
        } catch {
            setError('Network error starting payment. Please check your connection and retry.');
            setLoading(false);
        }
    }

    if (paidNow) {
        return (
            <div
                data-testid="whatsapp-link-paid-banner"
                className="rounded-xl border border-success/30 bg-success-subtle p-4 text-sm text-success-subtle-foreground space-y-1"
            >
                <p className="font-semibold">✓ Payment verified &amp; official receipt issued!</p>
                <p>Your school fee ledger has been updated automatically.</p>
            </div>
        );
    }

    if (!payable) {
        return null;
    }

    return (
        <div className="space-y-3">
            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive-subtle p-3 text-xs text-destructive-subtle-foreground"
                >
                    {error}
                </div>
            )}

            <Button
                type="button"
                data-testid="whatsapp-pay-now-button"
                disabled={loading || !razorpayConfigured}
                onClick={handlePayNow}
                className="w-full py-6 text-base font-semibold"
            >
                {loading
                    ? 'Opening UPI / NetBanking / Card checkout…'
                    : `Pay ${balanceFormatted} via UPI / NetBanking / Card`}
            </Button>

            {!razorpayConfigured && (
                <p className="rounded-xl border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
                    This school&apos;s online UPI gateway credentials are currently being activated. Please sign in to the Parent Portal or visit the campus fee counter.
                </p>
            )}
        </div>
    );
}
