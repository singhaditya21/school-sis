import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_123456789', {
    apiVersion: '2025-02-24.acacia' as any,
    appInfo: {
        name: 'ScholarMind SIS',
        version: '0.1.0',
    },
});
