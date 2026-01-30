import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

/**
 * GET /api/auth/token
 * Returns the current session token for client-side API calls.
 */
export async function GET() {
    const session = await getSession();

    if (!session.isLoggedIn || !session.token) {
        return NextResponse.json({ token: null }, { status: 401 });
    }

    return NextResponse.json({
        token: session.token,
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        email: session.email,
    });
}
