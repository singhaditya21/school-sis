import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Conversational assistant endpoint.
 *
 * This proxied to a Python agent service that was removed from the repository
 * (commit e2791939); there is no worker left to forward to, so it returns 501 rather
 * than a connection error dressed up as an assistant reply. The supported assistant
 * surface is POST /api/copilot, which drafts a governed report configuration for a
 * human to review — see apps/web/src/app/(admin)/chat.
 *
 * Auth and the AI rate limit are still applied so this endpoint cannot be used as an
 * unauthenticated probe or as free capacity against the shared limiter.
 */
export async function POST() {
    const auth = await requireApiAuth([
        'PLATFORM_ADMIN',
        'SUPER_ADMIN',
        'SCHOOL_ADMIN',
        'PRINCIPAL',
        'ACCOUNTANT',
        'ADMISSION_COUNSELOR',
        'TEACHER',
    ]);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
        scope: 'ai_chat',
        maxAttempts: 20,
        degradedMaxAttempts: 1,
        endpointClass: 'ai',
        message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    return NextResponse.json(
        {
            error:
                'The conversational agent service is not part of this deployment. Use POST /api/copilot to draft a report configuration for review.',
        },
        { status: 501 },
    );
}
