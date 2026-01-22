import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * Verify payment after Razorpay checkout
 */
export async function POST(request: NextRequest) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        const response = await fetch(`${API_BASE_URL}/api/v1/payments/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.token}`,
                'X-Tenant-Id': session.tenantId || '',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            return NextResponse.json(
                { error: error || 'Payment verification failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Payment verification error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
