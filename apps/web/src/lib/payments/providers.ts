import crypto from 'crypto';
import Stripe from 'stripe';

export type PaymentProviderName = 'RAZORPAY' | 'STRIPE';

export type ProviderOrder = {
    provider: PaymentProviderName;
    providerOrderId: string;
    amountMinor: number;
    currency: string;
    status: string;
    publicKey?: string;
    checkoutUrl?: string | null;
};

export type CreateProviderOrderInput = {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
};

export type CreateStripeCheckoutInput = CreateProviderOrderInput & {
    title: string;
    successUrl: string;
    cancelUrl: string;
};

function isBuildPhase(): boolean {
    return process.env.npm_lifecycle_event === 'build'
        || process.env.NEXT_PHASE === 'phase-production-build';
}

function rejectPlaceholderSecret(name: string, value: string): void {
    const lowered = value.toLowerCase();
    if (
        lowered.includes('mock') ||
        lowered.includes('dummy') ||
        lowered.includes('test-secret') ||
        lowered === 'dev-secret' ||
        lowered === 'changeme'
    ) {
        throw new Error(`${name} must not use a mock, dummy, or development secret.`);
    }
}

export function requirePaymentSecret(name: string, minLength = 16): string {
    const value = process.env[name];
    if (!value || value.length < minLength) {
        if (isBuildPhase()) {
            return 'build-time-placeholder-secret';
        }
        throw new Error(`${name} must be configured and at least ${minLength} characters.`);
    }
    if (process.env.NODE_ENV === 'production') {
        rejectPlaceholderSecret(name, value);
    }
    return value;
}

export function requirePaymentPublicKey(name: string): string {
    const value = process.env[name];
    if (!value) {
        if (isBuildPhase()) return 'build-time-public-key';
        throw new Error(`${name} must be configured.`);
    }
    if (process.env.NODE_ENV === 'production') {
        rejectPlaceholderSecret(name, value);
    }
    return value;
}

export class RazorpayGateway {
    readonly provider = 'RAZORPAY' as const;
    readonly keyId: string;
    private readonly keySecret: string;
    private readonly baseUrl = 'https://api.razorpay.com/v1';

    constructor() {
        this.keyId = requirePaymentPublicKey('RAZORPAY_KEY_ID');
        this.keySecret = requirePaymentSecret('RAZORPAY_KEY_SECRET', 16);
    }

    private get authHeader(): string {
        return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
    }

    async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
        const response = await fetch(`${this.baseUrl}/orders`, {
            method: 'POST',
            headers: {
                authorization: this.authHeader,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                amount: input.amountMinor,
                currency: input.currency,
                receipt: input.receipt,
                notes: input.notes,
            }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(data?.error?.description || 'Razorpay order creation failed.');
        }

        return {
            provider: this.provider,
            providerOrderId: data.id,
            amountMinor: data.amount,
            currency: data.currency,
            status: data.status || 'created',
            publicKey: this.keyId,
        };
    }

    verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
        if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

        const expectedSignature = crypto
            .createHmac('sha256', this.keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(signature, 'hex'),
        );
    }
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
    if (stripeClient) return stripeClient;

    const key = requirePaymentSecret('STRIPE_SECRET_KEY', 16);
    stripeClient = new Stripe(key, {
        apiVersion: '2026-02-25.clover',
        appInfo: {
            name: 'ScholarMind SIS',
            version: '0.1.0',
        },
    });

    return stripeClient;
}

export class StripeGateway {
    readonly provider = 'STRIPE' as const;
    private readonly stripe: Stripe;

    constructor() {
        this.stripe = getStripeClient();
    }

    async createCheckoutSession(input: CreateStripeCheckoutInput): Promise<ProviderOrder> {
        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: input.currency.toLowerCase(),
                        product_data: {
                            name: input.title,
                            description: `Payment for invoice ${input.notes.invoiceId || input.receipt}`,
                        },
                        unit_amount: input.amountMinor,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: input.notes,
            client_reference_id: input.notes.studentId,
        });

        return {
            provider: this.provider,
            providerOrderId: session.id,
            amountMinor: session.amount_total || input.amountMinor,
            currency: (session.currency || input.currency).toUpperCase(),
            status: session.status || 'open',
            checkoutUrl: session.url,
        };
    }

    async retrieveCheckoutSession(sessionId: string): Promise<ProviderOrder> {
        const session = await this.stripe.checkout.sessions.retrieve(sessionId);
        return {
            provider: this.provider,
            providerOrderId: session.id,
            amountMinor: session.amount_total || 0,
            currency: (session.currency || 'USD').toUpperCase(),
            status: session.status || 'open',
            checkoutUrl: session.url,
        };
    }

    constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
        const webhookSecret = requirePaymentSecret('STRIPE_WEBHOOK_SECRET', 16);
        return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
}

export function getRazorpayGateway(): RazorpayGateway {
    return new RazorpayGateway();
}

export function getStripeGateway(): StripeGateway {
    return new StripeGateway();
}
