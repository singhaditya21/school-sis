import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

/**
 * Payment verification endpoint for Razorpay.
 * Verifies HMAC-SHA256 signature and returns verification result.
 *
 * SECURITY: This endpoint was previously returning success unconditionally.
 * Now implements proper cryptographic signature verification.
 */

function getRazorpaySecret(): string {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        throw new Error(
            'RAZORPAY_KEY_SECRET environment variable is required for payment verification. ' +
            'Get it from your Razorpay Dashboard → Settings → API Keys.'
        );
    }
    return secret;
}

export async function POST(request: NextRequest) {
    // Auth check — no anonymous payment verification
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const { invoiceId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = body;

        // Validate required fields
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return NextResponse.json(
                { success: false, error: 'Missing required Razorpay verification fields: razorpayOrderId, razorpayPaymentId, razorpaySignature' },
                { status: 400 }
            );
        }

        if (!invoiceId) {
            return NextResponse.json(
                { success: false, error: 'Missing invoiceId' },
                { status: 400 }
            );
        }

        // Verify Razorpay HMAC-SHA256 signature
        const secret = getRazorpaySecret();
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        const isValid = crypto.timingSafeEqual(
            Buffer.from(generatedSignature, 'hex'),
            Buffer.from(razorpaySignature, 'hex')
        );

        if (!isValid) {
            console.error('[Payment Verify] Signature mismatch', {
                invoiceId,
                razorpayOrderId,
                // Never log the actual signatures in production
            });
            return NextResponse.json(
                { success: false, error: 'Payment signature verification failed. This payment cannot be confirmed.' },
                { status: 403 }
            );
        }

        // Signature verified — return success
        // TODO: Update invoice status in database (Phase 3 — mock removal)
        return NextResponse.json({
            success: true,
            data: {
                verified: true,
                paymentId: razorpayPaymentId,
                invoiceId,
                amount,
            }
        });
    } catch (error: any) {
        console.error('[Payment Verify] Error:', error.message);
        return NextResponse.json(
            { success: false, error: 'Payment verification failed due to an internal error' },
            { status: 500 }
        );
    }
}
