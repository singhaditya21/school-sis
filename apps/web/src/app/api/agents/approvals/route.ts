import { NextRequest } from 'next/server';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { agentUnavailableResponse, forwardAgentRequest } from '@/lib/agents/client';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    try {
        return await forwardAgentRequest(
            auth.context,
            `/api/v1/approvals/${auth.context.tenantId}`,
        );
    } catch (error) {
        return agentUnavailableResponse(error);
    }
}
