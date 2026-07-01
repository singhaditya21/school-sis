import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { agentUnavailableResponse, forwardAgentRequest } from '@/lib/agents/client';

export const dynamic = 'force-dynamic';

const ReviewSchema = z.object({
    action: z.enum(['APPROVED', 'REJECTED']),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ approvalId: string }> },
) {
    const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = ReviewSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid review request' }, { status: 400 });
    }

    const { approvalId } = await params;
    try {
        return await forwardAgentRequest(
            auth.context,
            `/api/v1/approvals/${auth.context.tenantId}/${encodeURIComponent(approvalId)}/review`,
            {
                method: 'POST',
                body: {
                    action: parsed.data.action,
                    user_id: auth.context.userId,
                },
            },
        );
    } catch (error) {
        return agentUnavailableResponse(error);
    }
}
