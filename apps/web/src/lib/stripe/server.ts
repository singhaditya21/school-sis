import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is required for Stripe operations');
    }

    if (stripeClient) return stripeClient;

    stripeClient = new Stripe(key, {
    apiVersion: '2025-02-24.acacia' as any,
    appInfo: {
        name: 'ScholarMind SIS',
        version: '0.1.0',
    },
    });

    return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
    get(_target, property, receiver) {
        return Reflect.get(getStripeServerClient(), property, receiver);
    },
});
