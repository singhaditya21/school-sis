import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

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
    return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

export async function POST(req: Request) {
    const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
    if (auth.ok === false) return auth.response;

    try {
        const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const body = json.data as any;
        const { invoiceId, amount, currency = 'USD', studentId, title } = body;

        if (!invoiceId || !amount) {
            return NextResponse.json({ error: 'Invoice ID and Amount are required' }, { status: 400 });
        }

        if (typeof amount !== 'number' || amount <= 0 || amount > 10_000_000) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }

        // SECURITY: Server-side invoice ownership + amount verification
        const { pool } = await import('@/lib/db');

        const parentOnlyClause = auth.context.role === 'PARENT'
            ? 'AND EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = invoices.student_id AND g.tenant_id = invoices.tenant_id AND g.user_id = $3)'
            : '';
        const { rows } = await pool.query(
            `SELECT total_amount AS "totalAmount", paid_amount AS "paidAmount", status 
             FROM invoices 
             WHERE id = $1 AND tenant_id = $2 ${parentOnlyClause} LIMIT 1`,
            auth.context.role === 'PARENT'
                ? [invoiceId, auth.context.tenantId, auth.context.userId]
                : [invoiceId, auth.context.tenantId]
        );
        const invoice = rows[0];

        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Verify the amount matches what the server expects (outstanding balance)
        const expectedAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount || 0);
        if (Math.abs(amount - expectedAmount) > 0.01) {
            console.error(`[Stripe] Amount mismatch: client sent ${amount}, expected ${expectedAmount} for invoice ${invoiceId}`);
            return NextResponse.json({ error: 'Amount does not match invoice balance' }, { status: 400 });
        }

        if (invoice.status === 'PAID') {
            return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
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
                tenantId: auth.context.tenantId,
            }
        });

        return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
    } catch (error: any) {
        console.error('[Stripe] Error:', error.message);
        return NextResponse.json({ error: 'Failed to initialize payment gateway' }, { status: 500 });
    }
}
