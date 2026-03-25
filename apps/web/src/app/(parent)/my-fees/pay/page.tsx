'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

export default function PaymentCheckoutPage({
    searchParams,
}: {
    searchParams: { invoiceId?: string; amount?: string };
}) {
    const router = useRouter();
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'netbanking'>('card');
    const invoiceAmount = searchParams.amount ? parseFloat(searchParams.amount).toFixed(2) : '0.00';

    async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setProcessing(true);

        // Simulate secure API call to payment gateway
        await new Promise((resolve) => setTimeout(resolve, 2500));

        setSuccess(true);
        setProcessing(false);

        // Redirect after success animation
        setTimeout(() => {
            router.push('/my-fees?success=true');
        }, 3000);
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md shadow-2xl border-green-100">
                    <CardContent className="pt-10 pb-8 text-center">
                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative overflow-hidden">
                            <div className="absolute inset-0 bg-green-400 animate-ping opacity-20 border-green-300 rounded-full"></div>
                            <svg className="w-12 h-12 text-green-600 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h2 className="text-3xl font-extrabold text-gray-900 mb-2 font-display tracking-tight">Payment Successful</h2>
                        <p className="text-gray-500 mb-6 font-medium">Receipt #REC-{Math.floor(Math.random() * 1000000)} has been generated.</p>
                        <div className="bg-gray-50 p-4 rounded-xl border mb-6 inline-block w-full">
                            <div className="flex justify-between items-center mb-2"><span className="text-gray-500 text-sm">Amount Paid</span><span className="font-semibold text-gray-900">₹{invoiceAmount}</span></div>
                            <div className="flex justify-between items-center"><span className="text-gray-500 text-sm">Invoice ID</span><span className="font-mono text-xs font-semibold">{searchParams.invoiceId || 'N/A'}</span></div>
                        </div>
                        <p className="text-sm text-gray-400 animate-pulse">Redirecting back to your portal...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-4 md:p-8 font-sans">
            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-start">
                {/* Left Side: Order Summary */}
                <div className="hidden md:block space-y-6 sticky top-8">
                    <div>
                        <img src="/logo.png" alt="School" className="h-10 w-auto mb-8 opacity-90" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight font-display mb-2">Secure Checkout</h1>
                        <p className="text-gray-500">Complete your payment for term fees. All transactions are securely encrypted.</p>
                    </div>

                    <Card className="border-0 shadow-sm bg-white/50 backdrop-blur">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-medium text-gray-900">Tuition Fee - Term 1</p>
                                    <p className="text-sm text-gray-500 font-mono mt-1">INV-{searchParams.invoiceId || '12345678'}</p>
                                </div>
                                <span className="font-semibold text-gray-900">₹{invoiceAmount}</span>
                            </div>
                            <div className="h-px bg-gray-200 my-4" />
                            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <span className="text-gray-600 font-medium">Total due today</span>
                                <span className="text-2xl font-black tracking-tight text-gray-900">₹{invoiceAmount}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span>Powered by 256-bit SSL encryption</span>
                    </div>
                </div>

                {/* Right Side: Payment Form */}
                <Card className="border-0 shadow-2xl rounded-2xl overflow-hidden bg-white">
                    <div className="bg-gray-900 p-6 text-white md:hidden">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-gray-400 text-sm">Amount due</span>
                            <span className="text-xl font-bold tracking-tight">₹{invoiceAmount}</span>
                        </div>
                        <div className="text-gray-500 text-xs font-mono">INV-{searchParams.invoiceId || '12345678'}</div>
                    </div>

                    <CardContent className="p-6 md:p-8">
                        {/* Payment Methods */}
                        <div className="flex gap-2 mb-8 p-1 bg-gray-100 rounded-xl">
                            <button onClick={() => setPaymentMethod('card')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${paymentMethod === 'card' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Card</button>
                            <button onClick={() => setPaymentMethod('upi')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${paymentMethod === 'upi' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>UPI</button>
                            <button onClick={() => setPaymentMethod('netbanking')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${paymentMethod === 'netbanking' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Netbanking</button>
                        </div>

                        <form onSubmit={handlePayment} className="space-y-5 relative">
                            {/* Card Network Logos */}
                            {paymentMethod === 'card' && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="cardNumber" className="text-sm font-semibold text-gray-700">Card Number</Label>
                                        <div className="relative">
                                            <Input id="cardNumber" required placeholder="4000 1234 5678 9010" className="pl-10 h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-shadow rounded-lg font-mono text-base tracking-widest" />
                                            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <Label htmlFor="expiry" className="text-sm font-semibold text-gray-700">Expiry (MM/YY)</Label>
                                            <Input id="expiry" required placeholder="12/26" className="h-11 border-gray-300 focus:border-blue-500 rounded-lg font-mono text-base text-center" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="cvv" className="text-sm font-semibold text-gray-700 flex justify-between">
                                                <span>CVC/CVV</span>
                                            </Label>
                                            <Input id="cvv" required placeholder="123" type="password" maxLength={4} className="h-11 border-gray-300 focus:border-blue-500 rounded-lg font-mono text-base text-center tracking-[0.3em]" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="cardName" className="text-sm font-semibold text-gray-700">Name on Card</Label>
                                        <Input id="cardName" required placeholder="Name on Card" className="h-11 border-gray-300 focus:border-blue-500 rounded-lg" />
                                    </div>
                                </>
                            )}

                            {paymentMethod === 'upi' && (
                                <div className="space-y-6 text-center py-6">
                                    <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto flex items-center justify-center border-2 border-dashed border-gray-300">
                                        <span className="text-gray-400 font-medium">QR Code</span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-500">Scan with any UPI App</div>
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">or enter UPI ID</span></div>
                                    </div>
                                    <Input placeholder="example@upi" className="h-11 text-center" />
                                </div>
                            )}

                            {paymentMethod === 'netbanking' && (
                                <div className="space-y-4 py-4">
                                    <Label className="text-sm font-semibold text-gray-700">Select Bank</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank'].map(bank => (
                                            <div key={bank} className="border rounded-lg p-3 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-sm font-medium text-gray-700">{bank}</div>
                                        ))}
                                    </div>
                                    <select className="w-full h-11 border border-gray-300 rounded-lg px-3 mt-2 text-sm bg-white focus:border-blue-500 focus:ring-blue-500 outline-none">
                                        <option>Choose other bank...</option>
                                    </select>
                                </div>
                            )}

                            <div className="pt-6">
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-lg font-bold bg-[#0A2540] hover:bg-gray-800 text-white shadow-[0_4px_14px_0_rgba(10,37,64,0.39)] transition-all rounded-xl border-none active:scale-[0.98]"
                                    disabled={processing}
                                >
                                    {processing ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            Processing securely...
                                        </div>
                                    ) : (
                                        `Pay ₹${invoiceAmount}`
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
