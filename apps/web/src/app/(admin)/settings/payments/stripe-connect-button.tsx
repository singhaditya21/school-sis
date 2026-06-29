'use client';

import { useState } from 'react';
import { createStripeConnectAccount } from '@/lib/actions/payments';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function StripeConnectButton() {
    const [loading, setLoading] = useState(false);

    const handleConnectStripe = async () => {
        setLoading(true);
        try {
            const res = await createStripeConnectAccount();
            if (res.url) {
                window.location.href = res.url;
            }
        } catch (error) {
            console.error(error);
            alert("Failed to connect Stripe.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button onClick={handleConnectStripe} disabled={loading} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect with Stripe
        </Button>
    );
}
