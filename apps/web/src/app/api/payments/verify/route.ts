import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

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

async function assertInvoiceAccess(invoiceId: string, tenantId: string, userId: string, role: string) {
    const parentOnlyClause = role === 'PARENT'
        ? 'AND EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = i.student_id AND g.tenant_id = i.tenant_id AND g.user_id = $3)'
        : '';

    const { rows } = await pool.query(
        `SELECT i.id
         FROM invoices i
         WHERE i.id = $1
           AND i.tenant_id = $2
           ${parentOnlyClause}
         LIMIT 1`,
        role === 'PARENT' ? [invoiceId, tenantId, userId] : [invoiceId, tenantId]
    );

    return Boolean(rows[0]);
}

export async function POST(request: NextRequest) {
    const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
    if (auth.ok === false) return auth.response;

    try {
        const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const body = json.data as any;
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

        const hasInvoiceAccess = await assertInvoiceAccess(
            invoiceId,
            auth.context.tenantId,
            auth.context.userId,
            auth.context.role,
        );
        if (!hasInvoiceAccess) {
            return NextResponse.json(
                { success: false, error: 'Invoice not found' },
                { status: 404 }
            );
        }

        if (!/^[0-9a-f]{64}$/i.test(razorpaySignature)) {
            return NextResponse.json(
                { success: false, error: 'Invalid payment signature format' },
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
