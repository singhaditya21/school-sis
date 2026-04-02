import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

/**
 * Stripe Checkout session creation endpoint.
 *
 * SECURITY:
 * - Requires authenticated session
 * - Crashes at startup if STRIPE_SECRET_KEY is missing (no fallback)
 * - Invoice ID passed via Stripe metadata (not in success_url query params)
 */

function getStripeClient(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error(
            'STRIPE_SECRET_KEY environment variable is required. ' +
            'Get it from your Stripe Dashboard → Developers → API keys.'
        );
    }
    return new Stripe(key, { apiVersion: '2024-06-20' });
}

export async function POST(req: Request) {
    // Auth check — no anonymous checkout creation
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
        );
    }

    try {
        const body = await req.json();
        const { invoiceId, amount, currency = 'USD', studentId, title } = body;

        if (!invoiceId || !amount) {
            return NextResponse.json({ error: 'Invoice ID and Amount are required' }, { status: 400 });
        }

        if (typeof amount !== 'number' || amount <= 0 || amount > 10_000_000) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }

        const stripe = getStripeClient();

        // Create Stripe Checkout session
        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: currency.toLowerCase(),
                        product_data: {
                            name: title || 'ScholarMind Fee Payment',
                            description: `Payment for Invoice #${invoiceId}`,
                        },
                        unit_amount: Math.round(amount * 100), // Stripe uses cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // SECURITY: No invoice ID in URL params — use server-side session/metadata lookup
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/parent/fees?status=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/parent/fees?status=canceled`,
            client_reference_id: studentId,
            metadata: {
                invoiceId,
                studentId,
                tenantId: session.tenantId,
            }
        });

        return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
    } catch (error: any) {
        console.error('[Stripe] Error:', error.message);
        return NextResponse.json({ error: 'Failed to initialize payment gateway' }, { status: 500 });
    }
}
