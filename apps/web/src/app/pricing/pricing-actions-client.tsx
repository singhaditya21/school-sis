'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BillingCurrency } from '@/lib/billing/pricing-catalog';

export function UpgradePlanButton({
    planType,
    label,
    variant = 'outline',
    currency = 'INR',
    gstin = '',
    estimatedStudents,
}: {
    planType: 'AI_PRO' | 'ENTERPRISE';
    label: string;
    variant?: 'primary' | 'outline';
    currency?: BillingCurrency;
    gstin?: string;
    estimatedStudents?: number;
}) {
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    async function handleUpgrade() {
        setLoading(true);
        setNotice(null);
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planType,
                    currency,
                    ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
                    ...(estimatedStudents ? { estimatedStudents } : {}),
                }),
            });
            const data = (await response.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
            };
            if (response.ok && data.url) {
                window.location.assign(data.url);
                return;
            }
            if (response.status === 503) {
                setNotice(
                    currency === 'INR'
                        ? 'Online Razorpay / GST subscription billing is being finalized on this deployment. Your Core SIS workspace is already active — continue setup now and our onboarding team can issue a GST tax invoice (SAC 998314) anytime.'
                        : 'Self-serve card checkout is being finalized for this environment. Your Core SIS workspace is already active — continue setup now and our team can upgrade your tier anytime.',
                );
            } else {
                setNotice(data.error || 'Unable to start subscription checkout right now.');
            }
        } catch {
            setNotice('Network error starting subscription checkout. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    const baseClasses =
        variant === 'primary'
            ? 'inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50'
            : 'inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50';

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={handleUpgrade}
                disabled={loading}
                data-testid={`checkout-${planType.toLowerCase()}`}
                className={baseClasses}
            >
                {loading ? 'Starting secure checkout…' : label}
            </button>
            {notice && (
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-left text-xs text-warning-subtle-foreground space-y-1.5">
                    <p>{notice}</p>
                    <Link href="/onboarding" className="inline-block font-semibold underline">
                        Continue with Core SIS setup →
                    </Link>
                </div>
            )}
        </div>
    );
}
