/**
 * Backward-compatible payment provider facade.
 *
 * New payment APIs use '@/lib/payments/*' directly. This facade remains for
 * older imports and delegates to the hardened Razorpay gateway.
 */

import type { ProviderResult } from './index';
import { getRazorpayGateway } from '@/lib/payments/providers';

export interface CreateOrderOptions {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
}

export interface PaymentOrder {
    orderId: string;
    amount: number;
    currency: string;
    status: 'created' | 'attempted' | 'paid' | string;
    gatewayOrderId?: string;
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

class RazorpayPaymentProvider implements PaymentProvider {
    async createOrder(options: CreateOrderOptions): Promise<ProviderResult<PaymentOrder>> {
        try {
            const order = await getRazorpayGateway().createOrder({
                amountMinor: options.amount,
                currency: options.currency,
                receipt: options.receipt,
                notes: options.notes || {},
            });
            return {
                success: true,
                data: {
                    orderId: order.providerOrderId,
                    amount: order.amountMinor,
                    currency: order.currency,
                    status: order.status,
                    gatewayOrderId: order.providerOrderId,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Payment order creation failed',
            };
        }
    }

    async verifyPayment(options: VerifyPaymentOptions): Promise<ProviderResult<{ verified: boolean }>> {
        try {
            return {
                success: true,
                data: {
                    verified: getRazorpayGateway().verifyPaymentSignature(
                        options.orderId,
                        options.paymentId,
                        options.signature,
                    ),
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Payment verification failed',
            };
        }
    }

    async getPaymentStatus(_paymentId: string): Promise<ProviderResult<{ status: string }>> {
        return {
            success: false,
            error: 'Payment status lookup is only available through provider webhooks and reconciliation.',
        };
    }
}

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
    if (!instance) {
        instance = new RazorpayPaymentProvider();
    }
    return instance;
}
