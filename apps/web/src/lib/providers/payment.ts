/**
 * Payment Provider — mock + Razorpay implementation.
 * 
 * Set PAYMENT_PROVIDER env var to 'mock' (default) or 'razorpay'.
 * For Razorpay: Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
 */

import type { ProviderResult } from './index';
import crypto from 'crypto';

// ─── Interface ───────────────────────────────────────────────

export interface CreateOrderOptions {
    amount: number;        // in smallest currency unit (paise for INR)
    currency: string;      // e.g. 'INR'
    receipt: string;       // internal receipt/invoice ID
    notes?: Record<string, string>;
}

export interface PaymentOrder {
    orderId: string;
    amount: number;
    currency: string;
    status: 'created' | 'attempted' | 'paid';
    gatewayOrderId?: string;   // Razorpay order_id, etc.
}

export interface VerifyPaymentOptions {
    orderId: string;
    paymentId: string;
    signature: string;
}

export interface PaymentProvider {
    createOrder(options: CreateOrderOptions): Promise<ProviderResult<PaymentOrder>>;
    verifyPayment(options: VerifyPaymentOptions): Promise<ProviderResult<{ verified: boolean }>>;
    getPaymentStatus(paymentId: string): Promise<ProviderResult<{ status: string }>>;
}

// ─── Mock Implementation ─────────────────────────────────────

class MockPaymentProvider implements PaymentProvider {
    async createOrder(options: CreateOrderOptions): Promise<ProviderResult<PaymentOrder>> {
        const orderId = `mock_order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.log(`[MockPayment] Order created: ${orderId} for ₹${options.amount / 100}`);
        return {
            success: true,
            data: {
                orderId,
                amount: options.amount,
                currency: options.currency,
                status: 'created',
                gatewayOrderId: orderId,
            },
        };
    }

    async verifyPayment(options: VerifyPaymentOptions): Promise<ProviderResult<{ verified: boolean }>> {
        console.log(`[MockPayment] Verifying payment: ${options.paymentId}`);
        return { success: true, data: { verified: true } };
    }

    async getPaymentStatus(paymentId: string): Promise<ProviderResult<{ status: string }>> {
        console.log(`[MockPayment] Status check: ${paymentId}`);
        return { success: true, data: { status: 'captured' } };
    }
}

// ─── Razorpay Implementation ─────────────────────────────────

class RazorpayProvider implements PaymentProvider {
    private keyId: string;
    private keySecret: string;
    private baseUrl = 'https://api.razorpay.com/v1';

    constructor() {
        this.keyId = process.env.RAZORPAY_KEY_ID || '';
        this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        if (!this.keyId || !this.keySecret) {
            console.warn('[Razorpay] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET — will fail on API calls');
        }
    }

    private get authHeader() {
        return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    }

    async createOrder(options: CreateOrderOptions): Promise<ProviderResult<PaymentOrder>> {
        try {
            const res = await fetch(`${this.baseUrl}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authHeader,
                },
                body: JSON.stringify({
                    amount: options.amount,
                    currency: options.currency,
                    receipt: options.receipt,
                    notes: options.notes || {},
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                return { success: false, error: err.error?.description || 'Razorpay order creation failed' };
            }

            const data = await res.json();
            return {
                success: true,
                data: {
                    orderId: data.id,
                    amount: data.amount,
                    currency: data.currency,
                    status: data.status,
                    gatewayOrderId: data.id,
                },
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async verifyPayment(options: VerifyPaymentOptions): Promise<ProviderResult<{ verified: boolean }>> {
        try {
            const payload = `${options.orderId}|${options.paymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', this.keySecret)
                .update(payload)
                .digest('hex');

            const verified = expectedSignature === options.signature;
            return { success: true, data: { verified } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async getPaymentStatus(paymentId: string): Promise<ProviderResult<{ status: string }>> {
        try {
            const res = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
                headers: { Authorization: this.authHeader },
            });

            if (!res.ok) return { success: false, error: 'Failed to fetch payment status' };

            const data = await res.json();
            return { success: true, data: { status: data.status } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────

let _instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
    if (!_instance) {
        const provider = process.env.PAYMENT_PROVIDER || 'mock';
        switch (provider) {
            case 'razorpay':
                _instance = new RazorpayProvider();
                break;
            case 'mock':
            default:
                _instance = new MockPaymentProvider();
                break;
        }
        console.log(`[Payment] Using ${provider} provider`);
    }
    return _instance;
}

