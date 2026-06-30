import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/token
 * Returns non-sensitive session context for client-side API calls.
 */
export async function GET() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        email: session.email,
        authProvider: session.authProvider,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        mfaRequired: Boolean(session.mfaRequired),
        mfaVerified: Boolean(session.mfaVerified),
        impersonating: Boolean(session.impersonation?.actorUserId) || session.token?.startsWith('impersonating:'),
    });
}
