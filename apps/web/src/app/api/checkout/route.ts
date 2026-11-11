import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    getRazorpayGateway,
    getStripeClient,
    isRazorpayConfigured,
    isStripeConfigured,
} from '@/lib/payments/providers';
import {
    estimateMonthlySubscription,
    isValidIndianGstin,
    SAAS_SAC_CODE,
} from '@/lib/billing/pricing-catalog';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const SUBSCRIPTION_CHECKOUT_ROLES = ['PLATFORM_ADMIN', 'SUPER_ADMIN'] as const;

const CheckoutSchema = z.object({
    planType: z.enum(['AI_PRO', 'ENTERPRISE']),
    currency: z.enum(['INR', 'USD']).optional(),
    gstin: z.string().trim().max(20).optional(),
    estimatedStudents: z.number().int().min(1).max(100000).optional(),
});

function resolveServerPriceId(planType: 'AI_PRO' | 'ENTERPRISE'): string | null {
    const raw = planType === 'AI_PRO'
        ? process.env.STRIPE_PRICE_AI_PRO
        : process.env.STRIPE_PRICE_ENTERPRISE;
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveTrustedAppBaseUrl(): string | null {
    const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!raw) return null;
    try {
        const parsed = new URL(raw);
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.origin;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireApiAuth([...SUBSCRIPTION_CHECKOUT_ROLES]);
        if (auth.ok === false) return auth.response;

        if (auth.context.role !== 'SUPER_ADMIN' && auth.context.role !== 'PLATFORM_ADMIN') {
            return NextResponse.json(
                { error: 'Forbidden: Only super administrators can manage SaaS subscriptions' },
                { status: 403 },
            );
        }

        const session = await getSession();
        if (!session.companyId) {
            return NextResponse.json({ error: 'Company context is required' }, { status: 400 });
        }

        const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const parsed = CheckoutSchema.safeParse(json.data);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0]?.message || 'Invalid checkout request' },
                { status: 400 },
            );
        }
        const { planType, currency = 'INR', gstin, estimatedStudents = 500 } = parsed.data;
        const normalizedGstin = gstin?.trim().toUpperCase() || '';
        if (normalizedGstin && !isValidIndianGstin(normalizedGstin)) {
            return NextResponse.json(
                { error: 'Invalid Indian GSTIN format' },
                { status: 400 },
            );
        }

        const appBaseUrl = resolveTrustedAppBaseUrl();
        if (!appBaseUrl) {
            return NextResponse.json(
                { error: 'Application base URL is not configured' },
                { status: 503 },
            );
        }

        const priceId = resolveServerPriceId(planType);
        const canUseStripe = Boolean(priceId && isStripeConfigured());
        const canUseRazorpayInr = currency === 'INR' && isRazorpayConfigured();

        if (!canUseStripe && !canUseRazorpayInr) {
            return NextResponse.json(
                { error: `Subscription pricing is not configured for ${planType}` },
                { status: 503 },
            );
        }

        // Fetch the company from the DB
        const { rows: [company] } = await pool.query(
            `SELECT *, stripe_customer_id AS "stripeCustomerId" FROM companies WHERE id = $1`,
            [session.companyId],
        );

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        // Prefer Razorpay UPI/NetBanking/GST checkout for INR when Stripe price IDs are absent
        if (!canUseStripe && canUseRazorpayInr) {
            const estimate = estimateMonthlySubscription(planType, estimatedStudents, {
                applyCampusFloor: true,
            });
            const annualGrossInr = estimate.totalWithGstInr * 12;
            const amountMinor = annualGrossInr * 100;

            const gateway = getRazorpayGateway();
            const link = await gateway.createPaymentLink({
                amountMinor,
                currency: 'INR',
                referenceId: `saas_${company.id.slice(0, 12)}_${Date.now().toString(36)}`,
                description: `ScholarMind ${planType} Annual Subscription (incl. 18% GST · SAC ${SAAS_SAC_CODE})`,
                callbackUrl: `${appBaseUrl}/setup/success`,
                notes: {
                    companyId: String(company.id),
                    planType,
                    sacCode: SAAS_SAC_CODE,
                    ...(normalizedGstin ? { gstin: normalizedGstin } : {}),
                },
            });

            return NextResponse.json({
                provider: 'RAZORPAY',
                sessionId: link.providerOrderId,
                url: link.checkoutUrl,
            });
        }

        let stripeCustomerId = company.stripeCustomerId;

        // If no stripe customer exists for this company, create one without upgrading subscription_tier pre-payment
        if (!stripeCustomerId) {
            const stripe = getStripeClient();
            const customer = await stripe.customers.create({
                name: company.name,
                metadata: {
                    companyId: company.id,
                    ...(normalizedGstin ? { gstin: normalizedGstin } : {}),
                },
            });
            stripeCustomerId = customer.id;

            await pool.query(
                `UPDATE companies SET stripe_customer_id = $1 WHERE id = $2`,
                [stripeCustomerId, company.id],
            );
        }

        // Create the Stripe Checkout Session
        const stripe = getStripeClient();
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: priceId!,
                    quantity: 1,
                },
            ],
            // Use metadata to safely pass the companyId onto the webhook
            metadata: {
                companyId: company.id,
                planType,
                sacCode: SAAS_SAC_CODE,
                ...(normalizedGstin ? { gstin: normalizedGstin } : {}),
            },
            client_reference_id: company.id,
            success_url: `${appBaseUrl}/setup/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appBaseUrl}/pricing?canceled=true`,
        });

        return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
    } catch (error) {
        console.error('[STRIPE_CHECKOUT_ERROR]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 },
        );
    }
}
