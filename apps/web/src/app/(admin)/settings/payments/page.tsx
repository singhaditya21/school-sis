import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { StripeConnectButton } from './stripe-connect-button';

export default async function PaymentsSettingsPage() {
    const { tenantId } = await requireAuth();
    
    // Check if connected
    const res = await pool.query('SELECT stripe_connect_account_id FROM tenants WHERE id = $1', [tenantId]);
    const isConnected = !!res.rows[0]?.stripe_connect_account_id;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Payment Processing</h1>
                <p className="text-muted-foreground mt-1">
                    Connect your Stripe account to start accepting fee payments directly from parents.
                </p>
            </div>

            <Card className={isConnected ? "border-green-100 bg-green-50/30" : "border-indigo-100 bg-indigo-50/30"}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {isConnected ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <CreditCard className="h-5 w-5 text-indigo-600" />}
                        Stripe Connect
                    </CardTitle>
                    <CardDescription>
                        {isConnected 
                            ? "Your Stripe account is successfully linked. You can now receive direct payments." 
                            : "We partner with Stripe for secure, direct payments. Funds settle directly into your bank account."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!isConnected && (
                        <>
                            <StripeConnectButton />
                            <p className="text-sm text-muted-foreground mt-4">
                                You will be redirected to Stripe to securely enter your bank details and verify your identity.
                            </p>
                        </>
                    )}
                    {isConnected && (
                        <p className="text-sm font-medium text-green-700">All set! Invoices paid by parents will now be routed directly to your connected Stripe account.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
