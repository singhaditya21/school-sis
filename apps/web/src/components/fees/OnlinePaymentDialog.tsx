'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface OnlinePaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    studentId: string;
    studentName: string;
    amount: number;
    invoiceNumber: string;
    onPaymentSuccess: (paymentDetails: PaymentDetails) => void;
}

interface PaymentDetails {
    orderId: string;
    paymentId: string;
    amount: number;
}

type PaymentStatus = 'idle' | 'creating' | 'ready' | 'processing' | 'success' | 'failed';

export function OnlinePaymentDialog({
    isOpen,
    onClose,
    invoiceId,
    studentId,
    studentName,
    amount,
    invoiceNumber,
    onPaymentSuccess
}: OnlinePaymentDialogProps) {
    const [status, setStatus] = useState<PaymentStatus>('idle');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const createOrder = async () => {
        setStatus('creating');
        setError(null);

        try {
            const response = await fetch('/api/payments/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceId,
                    studentId,
                    amount,
                    description: `Fee payment for ${invoiceNumber}`
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create payment order');
            }

            const data = await response.json();
            setOrderId(data.providerOrderId);
            setStatus('ready');

            // In production, initialize Razorpay checkout here
            // For demo, simulate payment flow
            simulatePayment(data.providerOrderId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment initialization failed');
            setStatus('failed');
        }
    };

    const simulatePayment = async (razorpayOrderId: string) => {
        setStatus('processing');

        // Simulate payment processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Simulate payment verification
        try {
            const mockPaymentId = 'pay_' + Math.random().toString(36).substring(7);
            const mockSignature = 'sig_' + Math.random().toString(36).substring(7);

            const response = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    razorpayOrderId,
                    razorpayPaymentId: mockPaymentId,
                    razorpaySignature: mockSignature
                })
            });

            if (!response.ok) {
                throw new Error('Payment verification failed');
            }

            const result = await response.json();

            if (result.success) {
                setStatus('success');
                onPaymentSuccess({
                    orderId: razorpayOrderId,
                    paymentId: mockPaymentId,
                    amount
                });
            } else {
                setError(result.message || 'Payment failed');
                setStatus('failed');
            }
        } catch (err) {
            setError('Payment verification failed');
            setStatus('failed');
        }
    };

    const handleClose = () => {
        if (status !== 'creating' && status !== 'processing') {
            setStatus('idle');
            setOrderId(null);
            setError(null);
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Online Fee Payment</DialogTitle>
                    <DialogDescription>
                        Pay fees securely using Razorpay
                    </DialogDescription>
                </DialogHeader>

                <Card className="border-0 shadow-none">
                    <CardContent className="pt-4">
                        {/* Payment Details */}
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Invoice</span>
                                <span className="font-medium">{invoiceNumber}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Student</span>
                                <span className="font-medium">{studentName}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold border-t pt-3">
                                <span>Amount</span>
                                <span className="text-green-600">₹{amount.toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        {/* Status Display */}
                        {status === 'idle' && (
                            <Button onClick={createOrder} className="w-full" size="lg">
                                <CreditCard className="mr-2 h-5 w-5" />
                                Pay with Razorpay
                            </Button>
                        )}

                        {status === 'creating' && (
                            <div className="text-center py-4">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                                <p className="mt-2 text-sm text-muted-foreground">Creating payment order...</p>
                            </div>
                        )}

                        {status === 'ready' && (
                            <div className="text-center py-4">
                                <div className="animate-pulse">
                                    <CreditCard className="h-8 w-8 mx-auto text-blue-600" />
                                    <p className="mt-2 text-sm text-muted-foreground">Opening Razorpay checkout...</p>
                                </div>
                            </div>
                        )}

                        {status === 'processing' && (
                            <div className="text-center py-4">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-yellow-600" />
                                <p className="mt-2 text-sm text-muted-foreground">Processing payment...</p>
                            </div>
                        )}

                        {status === 'success' && (
                            <div className="text-center py-4">
                                <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                                <p className="mt-2 font-semibold text-green-700">Payment Successful!</p>
                                <p className="text-sm text-muted-foreground">Receipt will be generated shortly</p>
                                <Button onClick={handleClose} className="mt-4" variant="outline">
                                    Close
                                </Button>
                            </div>
                        )}

                        {status === 'failed' && (
                            <div className="text-center py-4">
                                <XCircle className="h-12 w-12 mx-auto text-red-600" />
                                <p className="mt-2 font-semibold text-red-700">Payment Failed</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                                <div className="flex gap-2 mt-4 justify-center">
                                    <Button onClick={() => setStatus('idle')} variant="outline">
                                        Try Again
                                    </Button>
                                    <Button onClick={handleClose} variant="ghost">
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Payment Methods Info */}
                        {status === 'idle' && (
                            <div className="mt-4 pt-4 border-t">
                                <p className="text-xs text-center text-muted-foreground">
                                    Supports UPI, Cards, Net Banking, Wallets
                                </p>
                                <div className="flex justify-center gap-2 mt-2">
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">UPI</span>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Cards</span>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">NetBanking</span>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Wallets</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </DialogContent>
        </Dialog>
    );
}
