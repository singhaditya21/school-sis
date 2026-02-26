import { NextRequest, NextResponse } from 'next/server';

/**
 * Payment API routes for Razorpay integration.
 * These routes handle order creation and payment verification.
 * Currently returns demo responses until Razorpay is configured.
 */

// POST /api/payments/orders - Create a payment order
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { invoiceId, amount, description } = body;

        // TODO: Replace with actual Razorpay order creation
        // const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_SECRET });
        // const order = await razorpay.orders.create({ amount: amount * 100, currency: 'INR', receipt: invoiceId });

        // Demo response (simulates Razorpay order)
        return NextResponse.json({
            success: true,
            data: {
                orderId: `order_demo_${Date.now()}`,
                amount: amount * 100,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_demo',
                description: description || 'Fee Payment',
                prefill: { name: 'Parent' },
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
