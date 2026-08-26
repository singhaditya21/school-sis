import { requireApiAuth } from '@/lib/auth/api';
import { NextResponse } from 'next/server';

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
 * Poll an agent job.
 *
 * Counterpart to POST /api/agents/[agent]/query-async, whose Python worker was removed
 * from the repository (commit e2791939). Nothing queues jobs any more, so there is no
 * job to report on and this returns 501 rather than an indefinite "in progress".
 */
export async function GET() {
    const auth = await requireApiAuth(AGENT_ROLES);
    if (auth.ok === false) return auth.response;

    return NextResponse.json(
        {
            error:
                'Agent job polling is not part of this deployment; no agent worker queues jobs. Use POST /api/copilot instead.',
        },
        { status: 501 },
    );
}
