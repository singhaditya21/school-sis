import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { agentUnavailableResponse, forwardAgentRequest } from '@/lib/agents/client';

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

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const auth = await requireApiAuth(AGENT_ROLES);
    if (auth.ok === false) return auth.response;

    const { jobId } = await params;
    try {
        return await forwardAgentRequest(
            auth.context,
            `/api/v1/agents/jobs/${encodeURIComponent(jobId)}`,
        );
    } catch (error) {
        return agentUnavailableResponse(error);
    }
}
