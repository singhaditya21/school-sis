'use client';

export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpaySuccessResponse) => void | Promise<void>;
    modal?: {
        ondismiss?: () => void;
    };
    theme?: {
        color?: string;
    };
}

interface RazorpayInstance {
    open: () => void;
    on: (
        event: 'payment.failed',
        callback: (response: { error?: { description?: string } }) => void,
    ) => void;
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

declare global {
    interface Window {
        Razorpay?: RazorpayConstructor;
    }
}

let scriptPromise: Promise<boolean> | null = null;

export function loadRazorpayCheckoutScript(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise<boolean>((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve(Boolean(window.Razorpay));
        script.onerror = () => {
            scriptPromise = null;
            resolve(false);
        };
        document.body.appendChild(script);
    });

    return scriptPromise;
}

export async function openRazorpayCheckoutModal(input: {
    keyId: string;
    orderId: string;
    amountMinor: number;
    currency: string;
    schoolName: string;
    description: string;
    onSuccess: (response: RazorpaySuccessResponse) => void | Promise<void>;
    onDismiss?: () => void;
    onError?: (message: string) => void;
}): Promise<void> {
    const loaded = await loadRazorpayCheckoutScript();
    if (!loaded || !window.Razorpay) {
        input.onError?.('Unable to load Razorpay secure checkout. Check your internet connection.');
        return;
    }

    const rzp = new window.Razorpay({
        key: input.keyId,
        amount: input.amountMinor,
        currency: input.currency,
        name: input.schoolName,
        description: input.description,
        order_id: input.orderId,
        handler: input.onSuccess,
        modal: {
            ondismiss: input.onDismiss,
        },
        theme: {
            color: '#0d9488',
        },
    });

    rzp.on('payment.failed', (failure) => {
        input.onError?.(
            failure?.error?.description || 'Payment failed or was declined by your bank/UPI app.',
        );
    });

    rzp.open();
}
