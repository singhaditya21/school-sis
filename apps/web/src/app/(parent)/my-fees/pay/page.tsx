'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MockPaymentPage({
    searchParams,
}: {
    searchParams: { invoiceId?: string; amount?: string };
}) {
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setProcessing(true);

        const formData = new FormData(e.currentTarget);

        // Simulate payment processing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // In real app, this would call the payment gateway
        // For now, just redirect to success
        setSuccess(true);
        setProcessing(false);

        // Redirect after 2 seconds
        setTimeout(() => {
            window.location.href = '/parent/fees';
        }, 2000);
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6 text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="w-12 h-12 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            Payment Successful!
                        </h2>
                        <p className="text-gray-600 mb-4">
                            Your payment has been processed successfully.
                        </p>
                        <p className="text-sm text-gray-500">
                            Redirecting to fees page...
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-10 h-10 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                            />
                        </svg>
                    </div>
                    <CardTitle className="text-2xl">Mock Payment Gateway</CardTitle>
                    <p className="text-sm text-gray-600 mt-2">
                        This is a demo payment interface. No real charges will be made.
                    </p>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handlePayment} className="space-y-4">
                        <input
                            type="hidden"
                            name="invoiceId"
                            value={searchParams.invoiceId}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount to Pay</Label>
                            <Input
                                id="amount"
                                name="amount"
                                type="number"
                                step="0.01"
                                defaultValue={searchParams.amount}
                                required
                                className="text-lg font-semibold"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="cardNumber">Card Number</Label>
                            <Input
                                id="cardNumber"
                                name="cardNumber"
                                placeholder="4111 1111 1111 1111"
                                defaultValue="4111 1111 1111 1111"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="expiry">Expiry</Label>
                                <Input
                                    id="expiry"
                                    name="expiry"
                                    placeholder="MM/YY"
                                    defaultValue="12/26"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cvv">CVV</Label>
                                <Input
                                    id="cvv"
                                    name="cvv"
                                    placeholder="123"
                                    defaultValue="123"
                                    maxLength={3}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="cardName">Cardholder Name</Label>
                            <Input
                                id="cardName"
                                name="cardName"
                                placeholder="John Doe"
                                defaultValue="Test User"
                                required
                            />
                        </div>

                        <div className="pt-4">
                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                disabled={processing}
                            >
                                {processing ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Processing...
                                    </div>
                                ) : (
                                    `Pay ₹${searchParams.amount || '0'}`
                                )}
                            </Button>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                            <p className="text-xs text-yellow-800">
                                🔒 <strong>Demo Mode:</strong> This is a mock payment gateway.
                                Use any test card details. Payment will be auto-approved.
                            </p>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
