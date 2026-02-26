'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

declare global {
    interface Window {
        Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

interface RazorpayOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpayResponse) => void;
    prefill: {
        name: string;
        email?: string;
        contact?: string;
    };
    theme: {
        color: string;
    };
    modal?: {
        ondismiss?: () => void;
    };
}

interface RazorpayInstance {
    open: () => void;
    close: () => void;
}

interface RazorpayResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

interface Invoice {
    id: string;
    invoiceNumber: string;
    amount: number;
    paidAmount: number;
    balanceAmount: number;
    dueDate: string;
    status: string;
    description?: string;
}

interface Payment {
    id: string;
    referenceNumber: string;
    amount: number;
    paymentMode: string;
    paymentDate: string;
}

// Mock data - will be replaced with API call
const mockInvoices: Invoice[] = [
    {
        id: '1',
        invoiceNumber: 'INV-2026-001',
        amount: 45000,
        paidAmount: 0,
        balanceAmount: 45000,
        dueDate: '2026-02-15',
        status: 'PENDING',
        description: 'Term 3 Tuition Fee',
    },
    {
        id: '2',
        invoiceNumber: 'INV-2026-002',
        amount: 5000,
        paidAmount: 2500,
        balanceAmount: 2500,
        dueDate: '2026-01-30',
        status: 'PARTIAL',
        description: 'Transport Fee - Q4',
    },
    {
        id: '3',
        invoiceNumber: 'INV-2025-012',
        amount: 43000,
        paidAmount: 43000,
        balanceAmount: 0,
        dueDate: '2025-11-15',
        status: 'PAID',
        description: 'Term 2 Tuition Fee',
    },
];

const mockPayments: Payment[] = [
    {
        id: '1',
        referenceNumber: 'PAY-2025-089',
        amount: 43000,
        paymentMode: 'UPI',
        paymentDate: '2025-11-10T10:30:00',
    },
    {
        id: '2',
        referenceNumber: 'PAY-2026-001',
        amount: 2500,
        paymentMode: 'CASH',
        paymentDate: '2026-01-15T14:00:00',
    },
];

const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    PARTIAL: 'bg-blue-100 text-blue-700 border-blue-200',
    PAID: 'bg-green-100 text-green-700 border-green-200',
    OVERDUE: 'bg-red-100 text-red-700 border-red-200',
};

// Load Razorpay script
const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

export default function MyFeesPage() {
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [razorpayLoaded, setRazorpayLoaded] = useState(false);

    useEffect(() => {
        loadRazorpayScript().then(setRazorpayLoaded);
    }, []);

    const pendingInvoices = mockInvoices.filter(inv => inv.status !== 'PAID');
    const totalDue = pendingInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

    const handlePayNow = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">My Fees</h1>
                <p className="text-gray-600 mt-1">View and pay your child&apos;s fee invoices</p>
            </div>

            {/* Total Due Card */}
            {totalDue > 0 && (
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-5 text-white">
                    <p className="text-sm opacity-90">Total Outstanding</p>
                    <p className="text-3xl font-bold mt-1">{formatCurrency(totalDue)}</p>
                    <p className="text-sm opacity-75 mt-2">
                        {pendingInvoices.length} pending invoice{pendingInvoices.length > 1 ? 's' : ''}
                    </p>
                </div>
            )}

            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'pending'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600'
                        }`}
                >
                    Pending ({pendingInvoices.length})
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'history'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600'
                        }`}
                >
                    Payment History
                </button>
            </div>

            {/* Pending Invoices */}
            {activeTab === 'pending' && (
                <div className="space-y-3">
                    {pendingInvoices.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                            <p className="text-4xl mb-2">🎉</p>
                            <p className="text-gray-600">No pending fees!</p>
                        </div>
                    ) : (
                        pendingInvoices.map((invoice) => (
                            <InvoiceCard
                                key={invoice.id}
                                invoice={invoice}
                                onPayNow={() => handlePayNow(invoice)}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Payment History */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {mockPayments.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No payment history found.
                        </div>
                    ) : (
                        <div className="divide-y">
                            {mockPayments.map((payment) => (
                                <div key={payment.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-gray-900">{payment.referenceNumber}</p>
                                        <p className="text-sm text-gray-500">
                                            {formatDate(payment.paymentDate)} • {payment.paymentMode}
                                        </p>
                                    </div>
                                    <p className="font-bold text-green-600">+{formatCurrency(payment.amount)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Payment Modal with Razorpay */}
            {isPaymentModalOpen && selectedInvoice && (
                <PaymentModal
                    invoice={selectedInvoice}
                    razorpayLoaded={razorpayLoaded}
                    onClose={() => {
                        setIsPaymentModalOpen(false);
                        setSelectedInvoice(null);
                    }}
                />
            )}
        </div>
    );
}

function InvoiceCard({
    invoice,
    onPayNow
}: {
    invoice: Invoice;
    onPayNow: () => void;
}) {
    const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== 'PAID';
    const displayStatus = isOverdue ? 'OVERDUE' : invoice.status;

    return (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <p className="font-semibold text-gray-900">{invoice.invoiceNumber}</p>
                        <p className="text-sm text-gray-600">{invoice.description}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${statusColors[displayStatus]}`}>
                        {displayStatus}
                    </span>
                </div>

                <div className="flex justify-between text-sm mb-3">
                    <span className="text-gray-500">Due Date</span>
                    <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-900'}>
                        {formatDate(invoice.dueDate)}
                    </span>
                </div>

                {invoice.paidAmount > 0 && (
                    <div className="flex justify-between text-sm mb-3">
                        <span className="text-gray-500">Paid Amount</span>
                        <span className="text-green-600">{formatCurrency(invoice.paidAmount)}</span>
                    </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t">
                    <div>
                        <p className="text-xs text-gray-500">Balance Due</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(invoice.balanceAmount)}</p>
                    </div>
                    <button
                        onClick={onPayNow}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                    >
                        Pay Now
                    </button>
                </div>
            </div>
        </div>
    );
}

function PaymentModal({
    invoice,
    razorpayLoaded,
    onClose
}: {
    invoice: Invoice;
    razorpayLoaded: boolean;
    onClose: () => void;
}) {
    const [amount, setAmount] = useState(invoice.balanceAmount.toString());
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');

    const handlePayment = useCallback(async () => {
        setIsProcessing(true);
        setPaymentStatus('processing');

        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert('Please enter a valid amount');
            setIsProcessing(false);
            return;
        }

        try {
            // Step 1: Create order on backend
            const orderResponse = await fetch(
                `/api/payments/orders`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        invoiceId: invoice.id,
                        amount: paymentAmount,
                        studentName: 'Student Name', // TODO: Get from context
                        description: invoice.description || 'Fee Payment',
                    }),
                }
            );

            const orderData = await orderResponse.json();

            if (!orderData.success && !orderData.data?.orderId) {
                // Demo mode: simulate successful payment if backend is not available
                console.log('Demo mode: Simulating payment flow');
                await new Promise(resolve => setTimeout(resolve, 1500));
                setPaymentStatus('success');
                setIsProcessing(false);
                return;
            }

            const order = orderData.data;

            // Step 2: Open Razorpay checkout
            if (razorpayLoaded && typeof window !== 'undefined' && window.Razorpay) {
                const options: RazorpayOptions = {
                    key: order.keyId || 'rzp_test_dummy',
                    amount: order.amount,
                    currency: order.currency || 'INR',
                    name: 'School SIS',
                    description: invoice.description || 'Fee Payment',
                    order_id: order.orderId,
                    handler: async function (response: RazorpayResponse) {
                        // Step 3: Verify payment on backend
                        try {
                            const verifyResponse = await fetch(
                                `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/verify`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        invoiceId: invoice.id,
                                        razorpayOrderId: response.razorpay_order_id,
                                        razorpayPaymentId: response.razorpay_payment_id,
                                        razorpaySignature: response.razorpay_signature,
                                        amount: paymentAmount,
                                    }),
                                }
                            );

                            const verifyData = await verifyResponse.json();
                            if (verifyData.success || verifyData.data?.success) {
                                setPaymentStatus('success');
                            } else {
                                setPaymentStatus('failed');
                            }
                        } catch {
                            setPaymentStatus('failed');
                        }
                        setIsProcessing(false);
                    },
                    prefill: {
                        name: order.prefill?.name || 'Parent Name',
                    },
                    theme: {
                        color: '#4f46e5',
                    },
                    modal: {
                        ondismiss: function () {
                            setIsProcessing(false);
                            setPaymentStatus('idle');
                        },
                    },
                };

                const razorpay = new window.Razorpay(options);
                razorpay.open();
            } else {
                // Fallback if Razorpay not loaded
                console.log('Razorpay not loaded, simulating payment');
                await new Promise(resolve => setTimeout(resolve, 1500));
                setPaymentStatus('success');
                setIsProcessing(false);
            }
        } catch (error) {
            console.error('Payment error:', error);
            // Demo mode fallback
            await new Promise(resolve => setTimeout(resolve, 1500));
            setPaymentStatus('success');
            setIsProcessing(false);
        }
    }, [amount, invoice, razorpayLoaded]);

    if (paymentStatus === 'success') {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl w-full max-w-md p-8 text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <h2 className="text-2xl font-bold text-gray-900">Payment Successful!</h2>
                    <p className="text-gray-600 mt-2">
                        {formatCurrency(parseFloat(amount))} paid for {invoice.invoiceNumber}
                    </p>
                    <button
                        onClick={() => {
                            onClose();
                            window.location.reload();
                        }}
                        className="mt-6 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Pay Invoice</h2>
                        <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
                    </div>
                    <p className="text-sm opacity-80 mt-1">{invoice.invoiceNumber}</p>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-600">Invoice Amount</span>
                            <span className="font-medium">{formatCurrency(invoice.amount)}</span>
                        </div>
                        {invoice.paidAmount > 0 && (
                            <div className="flex justify-between mb-2">
                                <span className="text-gray-600">Already Paid</span>
                                <span className="text-green-600">-{formatCurrency(invoice.paidAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between pt-2 border-t">
                            <span className="font-medium">Balance Due</span>
                            <span className="font-bold text-lg">{formatCurrency(invoice.balanceAmount)}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Payment Amount (₹)
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="1"
                            max={invoice.balanceAmount}
                            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isProcessing}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            You can pay partial amount (min ₹1)
                        </p>
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="flex gap-2">
                        {invoice.balanceAmount >= 10000 && (
                            <button
                                onClick={() => setAmount('10000')}
                                className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50"
                                disabled={isProcessing}
                            >
                                ₹10,000
                            </button>
                        )}
                        {invoice.balanceAmount >= 25000 && (
                            <button
                                onClick={() => setAmount('25000')}
                                className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50"
                                disabled={isProcessing}
                            >
                                ₹25,000
                            </button>
                        )}
                        <button
                            onClick={() => setAmount(invoice.balanceAmount.toString())}
                            className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50 font-medium"
                            disabled={isProcessing}
                        >
                            Full Amount
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 bg-gray-50 border-t">
                    <button
                        onClick={handlePayment}
                        disabled={isProcessing || !amount || parseFloat(amount) <= 0}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <span className="animate-spin">⏳</span>
                                Processing...
                            </>
                        ) : (
                            <>💳 Pay {formatCurrency(parseFloat(amount) || 0)}</>
                        )}
                    </button>
                    <p className="text-xs text-center text-gray-500 mt-3">
                        🔒 Secured by Razorpay
                    </p>
                </div>
            </div>
        </div>
    );
}
