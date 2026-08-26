import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

const AGENT_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'TEACHER',
] as const;

/**
 * Queue an asynchronous agent query.
 *
 * The Python agent workers this forwarded to were removed from the repository
 * (commit e2791939). No job is created, so this returns 501 instead of handing back a
 * job id that will never complete. The supported assistant surface is POST
 * /api/copilot. Auth and the AI rate limit are kept so the endpoint stays guarded.
 */
export async function POST() {
    const auth = await requireApiAuth(AGENT_ROLES);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
        scope: 'ai_agent_query',
        maxAttempts: 20,
        degradedMaxAttempts: 1,
        endpointClass: 'ai',
        message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    return NextResponse.json(
        {
            error:
                'Asynchronous agent queries are not part of this deployment. Use POST /api/copilot to draft a report configuration for review.',
        },
        { status: 501 },
    );
}
