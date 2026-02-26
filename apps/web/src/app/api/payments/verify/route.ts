import { NextRequest, NextResponse } from 'next/server';

/**
 * Payment verification endpoint for Razorpay.
 * Verifies payment signature and updates invoice status.
 * Currently returns demo success until Razorpay is configured.
 */

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { invoiceId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = body;

        // TODO: Verify Razorpay signature
        // const crypto = require('crypto');
        // const generated = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET)
        //     .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        //     .digest('hex');
        // const isValid = generated === razorpaySignature;

        // Demo: always succeed
        return NextResponse.json({
            success: true,
            data: {
                success: true,
                paymentId: razorpayPaymentId || `pay_demo_${Date.now()}`,
                invoiceId,
                amount,
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
