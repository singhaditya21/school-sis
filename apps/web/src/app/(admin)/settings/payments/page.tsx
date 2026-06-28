'use client';

import { useState } from 'react';
import { createStripeConnectAccount } from '@/lib/actions/payments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react';

export default function PaymentsSettingsPage() {
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
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Payment Processing</h1>
                <p className="text-muted-foreground mt-1">
                    Connect your Stripe account to start accepting fee payments directly from parents.
                </p>
            </div>

            <Card className="border-indigo-100 bg-indigo-50/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-indigo-600" />
                        Stripe Connect
                    </CardTitle>
                    <CardDescription>
                        We partner with Stripe for secure, direct payments. Funds settle directly into your bank account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleConnectStripe} disabled={loading} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Connect with Stripe
                    </Button>
                    <p className="text-sm text-muted-foreground mt-4">
                        You will be redirected to Stripe to securely enter your bank details and verify your identity.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
