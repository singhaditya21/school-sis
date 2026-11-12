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

export type RazorpayRouteTransfer = {
    account: string;
    amount: number;
    currency: string;
    on_hold?: boolean;
    notes?: Record<string, string>;
};

export type CreateProviderOrderInput = {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
    transfers?: RazorpayRouteTransfer[];
};

export type CreateRazorpayPaymentLinkInput = {
    amountMinor: number;
    currency: string;
    referenceId: string;
    description: string;
    callbackUrl?: string;
    notes?: Record<string, string>;
};

export type CreateStripeCheckoutInput = CreateProviderOrderInput & {
    title: string;
    successUrl: string;
    cancelUrl: string;
    stripeAccount?: string;
};

export type ProviderRefund = {
    provider: PaymentProviderName;
    providerRefundId: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    status: string;
};

export type RefundProviderPaymentInput = {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    reason: string;
    idempotencyKey?: string;
    connectedAccountId?: string;
    stripeAccount?: string;
    metadata?: Record<string, string>;
};

export function buildRefundIdempotencyKey(input: {
    paymentId: string;
    approvalRequestId?: string;
    amountMinor: number;
}): string {
    return `refund:${input.paymentId}:${input.approvalRequestId || input.amountMinor}`;
}

function resolveRefundIdempotencyKey(input: RefundProviderPaymentInput): string {
    if (input.idempotencyKey) return input.idempotencyKey;
    return buildRefundIdempotencyKey({
        paymentId: input.metadata?.paymentId || input.providerPaymentId,
        approvalRequestId: input.metadata?.approvalRequestId,
        amountMinor: input.amountMinor,
    });
}

function toRazorpayRefundReceipt(idempotencyKey: string): string {
    if (idempotencyKey.length <= 40) return idempotencyKey;
    const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 35);
    return `rfnd_${digest}`;
}

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

export function isRazorpayConfigured(): boolean {
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (keyId.length < 8 || keySecret.length < 16) return false;
    if (process.env.NODE_ENV === 'production') {
        try {
            rejectPlaceholderSecret('RAZORPAY_KEY_ID', keyId);
            rejectPlaceholderSecret('RAZORPAY_KEY_SECRET', keySecret);
        } catch {
            return false;
        }
    }
    return true;
}

export function isStripeConfigured(): boolean {
    const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (secret.length < 16) return false;
    if (process.env.NODE_ENV === 'production') {
        try {
            rejectPlaceholderSecret('STRIPE_SECRET_KEY', secret);
        } catch {
            return false;
        }
    }
    return true;
}

export function resolveRazorpayRouteAccountId(explicitAccountId?: string | null): string | null {
    const candidate = (explicitAccountId || process.env.RAZORPAY_ROUTE_ACCOUNT_ID || '').trim();
    if (!candidate || !/^acc_[A-Za-z0-9]{8,32}$/.test(candidate)) {
        return null;
    }
    return candidate;
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
                ...(input.transfers && input.transfers.length > 0 ? { transfers: input.transfers } : {}),
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

    async createPaymentLink(input: CreateRazorpayPaymentLinkInput): Promise<ProviderOrder> {
        const response = await fetch(`${this.baseUrl}/payment_links`, {
            method: 'POST',
            headers: {
                authorization: this.authHeader,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                amount: input.amountMinor,
                currency: input.currency,
                accept_partial: false,
                reference_id: input.referenceId.slice(0, 40),
                description: input.description.slice(0, 200),
                ...(input.callbackUrl
                    ? {
                        callback_url: input.callbackUrl,
                        callback_method: 'get',
                    }
                    : {}),
                notes: input.notes || {},
            }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.short_url) {
            throw new Error(data?.error?.description || 'Razorpay payment link creation failed.');
        }

        return {
            provider: this.provider,
            providerOrderId: data.id,
            amountMinor: data.amount ?? input.amountMinor,
            currency: (data.currency || input.currency).toUpperCase(),
            status: data.status || 'created',
            publicKey: this.keyId,
            checkoutUrl: data.short_url,
        };
    }

    async refundPayment(input: RefundProviderPaymentInput): Promise<ProviderRefund> {
        const idempotencyKey = resolveRefundIdempotencyKey(input);
        const response = await fetch(`${this.baseUrl}/payments/${encodeURIComponent(input.providerPaymentId)}/refund`, {
            method: 'POST',
            headers: {
                authorization: this.authHeader,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                amount: input.amountMinor,
                receipt: toRazorpayRefundReceipt(idempotencyKey),
                notes: {
                    reason: input.reason,
                    idempotencyKey,
                    ...(input.metadata ?? {}),
                },
            }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(data?.error?.description || 'Razorpay refund failed.');
        }

        return {
            provider: this.provider,
            providerRefundId: data.id,
            providerPaymentId: input.providerPaymentId,
            amountMinor: data.amount ?? input.amountMinor,
            currency: data.currency || input.currency,
            status: data.status || 'created',
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

    verifyWebhookSignature(rawBody: string, signature: string): boolean {
        return verifyRazorpayWebhookSignature(rawBody, signature);
    }
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

    const webhookSecret = requirePaymentSecret('RAZORPAY_WEBHOOK_SECRET', 16);
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex'),
    );
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
        const sessionPayload: Stripe.Checkout.SessionCreateParams = {
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
        };
        const session = input.stripeAccount
            ? await this.stripe.checkout.sessions.create(sessionPayload, { stripeAccount: input.stripeAccount })
            : await this.stripe.checkout.sessions.create(sessionPayload);

        return {
            provider: this.provider,
            providerOrderId: session.id,
            amountMinor: session.amount_total || input.amountMinor,
            currency: (session.currency || input.currency).toUpperCase(),
            status: session.status || 'open',
            checkoutUrl: session.url,
        };
    }

    async retrieveCheckoutSession(sessionId: string, stripeAccount?: string): Promise<ProviderOrder> {
        const session = stripeAccount
            ? await this.stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount })
            : await this.stripe.checkout.sessions.retrieve(sessionId);
        return {
            provider: this.provider,
            providerOrderId: session.id,
            amountMinor: session.amount_total || 0,
            currency: (session.currency || 'INR').toUpperCase(),
            status: session.status || 'open',
            checkoutUrl: session.url,
        };
    }

    async refundPayment(input: RefundProviderPaymentInput): Promise<ProviderRefund> {
        const idempotencyKey = resolveRefundIdempotencyKey(input);
        const stripeAccount = input.stripeAccount || input.connectedAccountId || input.metadata?.stripeConnectAccountId || undefined;
        const refund = await this.stripe.refunds.create(
            {
                payment_intent: input.providerPaymentId,
                amount: input.amountMinor,
                metadata: {
                    reason: input.reason,
                    ...(input.metadata ?? {}),
                },
            },
            {
                idempotencyKey,
                ...(stripeAccount ? { stripeAccount } : {}),
            },
        );

        return {
            provider: this.provider,
            providerRefundId: refund.id,
            providerPaymentId: input.providerPaymentId,
            amountMinor: refund.amount,
            currency: refund.currency.toUpperCase(),
            status: refund.status || 'pending',
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
