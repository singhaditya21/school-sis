import { NextResponse } from 'next/server';
import { listCapabilityDecisions } from '@/lib/capabilities';
import { configuredProviderRequirements } from '@/lib/capabilities/providers';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const capabilities = listCapabilityDecisions({
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        configuredProviders: configuredProviderRequirements(),
        hasPermission: (permission) => hasPermission(session.role as UserRole, permission),
        allowInternal: session.role === 'PLATFORM_ADMIN'
            && process.env.CAPABILITIES_INTERNAL_ACCESS === 'true',
    }).map(({ id, lifecycle, available, reason }) => ({
        id,
        lifecycle,
        available,
        ...(reason ? { reason } : {}),
    }));

    return NextResponse.json({ capabilities });
}
