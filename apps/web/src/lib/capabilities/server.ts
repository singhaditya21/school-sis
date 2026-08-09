import { requireAuth, type AuthContext } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { evaluateCapability } from './evaluator';
import { configuredProviderRequirements } from './providers';
import type { CapabilityDecision, CapabilityId } from './types';

export class CapabilityAccessError extends Error {
    readonly capabilityId: CapabilityId;
    readonly decision: CapabilityDecision;
    readonly status: number;

    constructor(decision: CapabilityDecision) {
        const status = capabilityDecisionHttpStatus(decision);
        super(`Capability ${decision.id} is unavailable (${decision.reason || 'UNKNOWN'}).`);
        this.name = 'CapabilityAccessError';
        this.capabilityId = decision.id;
        this.decision = decision;
        this.status = status;
    }
}

export function capabilityDecisionHttpStatus(decision: CapabilityDecision): number {
    switch (decision.reason) {
        case 'HIDDEN':
            return 404;
        case 'UNCONFIGURED':
            return 503;
        case 'NOT_ENTITLED':
        case 'INSTITUTION_UNSUPPORTED':
        case 'INTERNAL_ONLY':
        case 'FORBIDDEN':
        default:
            return 403;
    }
}

/**
 * Server-action/API guard. Existing RBAC remains authoritative: callers may
 * supply a route/action-specific permission, and registry permissions are
 * evaluated in addition to it.
 */
export async function requireCapability(
    capabilityId: CapabilityId,
    permission?: string,
): Promise<AuthContext & { capability: CapabilityDecision }> {
    const auth = await requireAuth(permission);
    const session = await getSession();
    const decision = evaluateCapability(capabilityId, {
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        configuredProviders: configuredProviderRequirements(),
        hasPermission: (requiredPermission) => hasPermission(
            auth.session.role as UserRole,
            requiredPermission,
        ),
        allowInternal: session.role === 'PLATFORM_ADMIN'
            && process.env.CAPABILITIES_INTERNAL_ACCESS === 'true',
    });

    if (!decision.available) {
        throw new CapabilityAccessError(decision);
    }

    return { ...auth, capability: decision };
}
