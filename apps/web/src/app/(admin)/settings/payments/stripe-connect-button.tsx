'use client';

import { useState } from 'react';
import { createStripeConnectAccount } from '@/lib/actions/payments';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Starts (or resumes) Stripe Connect onboarding. The server action creates the
 * account link and hands back a one-time Stripe URL; nothing here reports
 * success on its own — the browser leaves for Stripe, and the settings page
 * re-reads the real account state when it comes back.
 */
export function StripeConnectButton({ label = 'Connect with Stripe' }: { label?: string }) {
    const [loading, setLoading] = useState(false);

    const handleConnectStripe = async () => {
        setLoading(true);
        try {
            const res = await createStripeConnectAccount();
            if (res?.url) {
                window.location.href = res.url;
                return;
            }
            toast.error('Stripe did not return an onboarding link. Please try again.');
        } catch (error) {
            console.error('Stripe Connect onboarding failed', error);
            toast.error('Could not reach Stripe to start onboarding. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={handleConnectStripe}
            disabled={loading}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700"
        >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {label}
        </Button>
    );
}
